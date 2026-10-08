const CR = 0x0d;
const LF = 0x0a;
const DOT = 0x2e;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SmtpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void | Promise<void>;
}

export interface SmtpEnvelope {
  from: string;
  to: string;
}

/** The server refused the message for good (5xx); the sender should get a bounce. */
export class SmtpPermanentError extends Error {
  name = "SmtpPermanentError";
}

/** Anything else that went wrong; the message may be retried later. */
export class SmtpTemporaryError extends Error {
  name = "SmtpTemporaryError";
}

export async function deliverSmtp(socket: SmtpSocket, envelope: SmtpEnvelope, raw: Uint8Array): Promise<void> {
  const session = new SmtpSession(socket);
  try {
    await session.expect(220);
    await session.send(`EHLO ${domainOf(envelope.to)}`, 250);
    await session.send(`MAIL FROM:<${envelope.from}>`, 250);
    await session.send(`RCPT TO:<${envelope.to}>`, 250);
    await session.send("DATA", 354);
    await session.write(dotStuff(raw));
    await session.expect(250);
    // The message is accepted at this point; a failed QUIT must not trigger a duplicate retry.
    await session.send("QUIT", 221).catch(() => {});
  } finally {
    await session.close();
  }
}

class SmtpSession {
  private readonly socket: SmtpSocket;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer: Uint8Array = new Uint8Array();

  constructor(socket: SmtpSocket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  async send(command: string, code: number): Promise<void> {
    await this.write(encoder.encode(`${command}\r\n`));
    await this.expect(code);
  }

  async expect(code: number): Promise<void> {
    const reply = await this.readReply();
    if (reply.startsWith(String(code))) return;
    if (reply.startsWith("5")) throw new SmtpPermanentError(reply);
    throw new SmtpTemporaryError(reply);
  }

  async write(bytes: Uint8Array): Promise<void> {
    await this.writer.write(bytes).catch((error) => {
      throw new SmtpTemporaryError(`SMTP write failed: ${error}`);
    });
  }

  async close(): Promise<void> {
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.socket.close();
  }

  /** Reads a possibly multi-line reply; the last line has a space after the code ("250 OK"). */
  private async readReply(): Promise<string> {
    const lines: string[] = [];
    let line: string;
    do {
      line = await this.readLine();
      if (!/^\d{3}[ -]/.test(line)) throw new SmtpTemporaryError(`Malformed SMTP reply: ${line}`);
      lines.push(line);
    } while (line[3] === "-");
    return lines.join("\n");
  }

  private async readLine(): Promise<string> {
    let end: number;
    while ((end = this.buffer.indexOf(LF)) === -1) {
      const { done, value } = await this.reader.read();
      // Workers VPC does not fail connect() for an unreachable host; the stream simply ends.
      if (done) throw new SmtpTemporaryError("SMTP connection closed before a complete reply");
      this.buffer = concat(this.buffer, value);
    }
    const line = decoder.decode(this.buffer.subarray(0, end)).replace(/\r$/, "");
    this.buffer = this.buffer.slice(end + 1);
    return line;
  }
}

function domainOf(address: string): string {
  return address.split("@").pop()?.trim() || "localhost";
}

/** Escapes lines starting with "." and appends the end-of-data marker (RFC 5321 section 4.5.2). */
function dotStuff(raw: Uint8Array): Uint8Array {
  const out: number[] = [];
  let lineStart = true;
  for (const byte of raw) {
    if (lineStart && byte === DOT) out.push(DOT);
    out.push(byte);
    lineStart = byte === LF;
  }
  if (out.at(-2) !== CR || out.at(-1) !== LF) out.push(CR, LF);
  out.push(DOT, CR, LF);
  return Uint8Array.from(out);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
