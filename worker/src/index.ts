import { deliverSmtp, SmtpPermanentError, type SmtpSocket } from "./smtp";

interface Env {
  SMTP_ADDRESS: string;
  VPC: { connect(address: string): SmtpSocket };
}

export default {
  async email(message, env) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    try {
      await deliverSmtp(env.VPC.connect(env.SMTP_ADDRESS), { from: message.from, to: message.to }, raw);
    } catch (error) {
      if (!(error instanceof SmtpPermanentError)) throw error;
      message.setReject(error.message);
    }
  },
} satisfies ExportedHandler<Env>;
