import assert from "node:assert/strict";
import net from "node:net";
import { after, test } from "node:test";
import { Duplex } from "node:stream";
import { deliverSmtp, SmtpPermanentError, SmtpTemporaryError } from "../src/smtp.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const servers = [];

after(async () => {
  await Promise.all(servers.map((server) => closeServer(server)));
});

test("delivers message bytes and dot-stuffs DATA lines", async () => {
  const raw = encoder.encode("Subject: hi\r\n\r\nfirst\r\n.line\r\nlast");
  const smtp = await startServer({ ehloReply: ["250-local", "250 PIPELINING"] });

  await deliverSmtp(await connect(smtp.port), {
    from: "sender@example.com",
    to: "user@example.net",
  }, raw);

  assert.deepEqual(smtp.commands, [
    "EHLO example.net",
    "MAIL FROM:<sender@example.com>",
    "RCPT TO:<user@example.net>",
    "DATA",
    "QUIT",
  ]);
  assert.equal(decoder.decode(smtp.data), "Subject: hi\r\n\r\nfirst\r\n..line\r\nlast\r\n");
});

test("succeeds when server closes after accepting DATA", async () => {
  const raw = encoder.encode("Subject: accepted\r\n\r\nbody\r\n");
  const smtp = await startServer({ closeAfterData: true });

  await deliverSmtp(await connect(smtp.port), {
    from: "sender@example.com",
    to: "user@example.net",
  }, raw);

  assert.equal(decoder.decode(smtp.data), "Subject: accepted\r\n\r\nbody\r\n");
});

test("carries permanent RCPT failure reply text", async () => {
  const smtp = await startServer({ rcptReply: ["550 no such mailbox"] });

  await assert.rejects(
    deliverSmtp(await connect(smtp.port), {
      from: "sender@example.com",
      to: "missing@example.net",
    }, encoder.encode("Subject: hi\r\n\r\nbody\r\n")),
    (error) => {
      assert.ok(error instanceof SmtpPermanentError);
      assert.equal(error.message, "550 no such mailbox");
      return true;
    },
  );
});

test("treats 451 replies as temporary failures", async () => {
  const smtp = await startServer({ mailReply: ["451 try later"] });

  await assert.rejects(
    deliverSmtp(await connect(smtp.port), {
      from: "sender@example.com",
      to: "user@example.net",
    }, encoder.encode("Subject: hi\r\n\r\nbody\r\n")),
    (error) => {
      assert.ok(error instanceof SmtpTemporaryError);
      assert.equal(error.message, "451 try later");
      return true;
    },
  );
});

test("treats immediate close before greeting as temporary failure", async () => {
  const smtp = await startServer({ closeImmediately: true });

  await assert.rejects(
    deliverSmtp(await connect(smtp.port), {
      from: "sender@example.com",
      to: "user@example.net",
    }, encoder.encode("Subject: hi\r\n\r\nbody\r\n")),
    (error) => {
      assert.ok(error instanceof SmtpTemporaryError);
      assert.equal(error.message, "SMTP connection closed before a complete reply");
      return true;
    },
  );
});

test("uses an empty reverse path for bounce messages", async () => {
  const smtp = await startServer({});

  await deliverSmtp(await connect(smtp.port), {
    from: "",
    to: "user@example.net",
  }, encoder.encode("Subject: bounce\r\n\r\nbody\r\n"));

  assert.ok(smtp.commands.includes("MAIL FROM:<>"));
});

async function startServer(options) {
  const commands = [];
  const dataChunks = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let closedAfterData = false;

    if (options.closeImmediately) {
      socket.end();
      return;
    }

    writeReply(socket, options.greeting ?? ["220 test smtp"]);

    socket.on("data", (chunk) => {
      if (closedAfterData) {
        return;
      }

      buffer += chunk.toString("binary");

      while (true) {
        const end = buffer.indexOf("\r\n");
        if (end === -1) {
          return;
        }

        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            writeReply(socket, options.dataReply ?? ["250 queued"]);
            if (options.closeAfterData) {
              closedAfterData = true;
              socket.end();
              return;
            }
            continue;
          }

          dataChunks.push(encoder.encode(`${line}\r\n`));
          continue;
        }

        commands.push(line);

        if (line.startsWith("EHLO ")) {
          writeReply(socket, options.ehloReply ?? ["250 test"]);
        } else if (line.startsWith("MAIL FROM:")) {
          writeReply(socket, options.mailReply ?? ["250 ok"]);
        } else if (line.startsWith("RCPT TO:")) {
          writeReply(socket, options.rcptReply ?? ["250 ok"]);
        } else if (line === "DATA") {
          inData = true;
          writeReply(socket, options.startDataReply ?? ["354 end with dot"]);
        } else if (line === "QUIT") {
          writeReply(socket, options.quitReply ?? ["221 bye"]);
          socket.end();
        } else {
          writeReply(socket, ["500 unknown"]);
        }
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  servers.push(server);

  return {
    commands,
    get data() {
      return concat(dataChunks);
    },
    port: server.address().port,
  };
}

async function connect(port) {
  const socket = net.connect({ host: "127.0.0.1", port });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const webSocket = Duplex.toWeb(socket);

  return {
    readable: webSocket.readable,
    writable: webSocket.writable,
    close: () => socket.destroy(),
  };
}

function writeReply(socket, lines) {
  socket.write(`${lines.join("\r\n")}\r\n`, "binary");
}

function concat(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
