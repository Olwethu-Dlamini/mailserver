# email-smtp-bridge

`email-smtp-bridge` is a small Cloudflare Email Worker that relays inbound Email Routing messages over plain SMTP to a private mail server reachable through a Cloudflare Tunnel and a Workers VPC Network binding. It keeps the message bytes unchanged, so the private server can run its normal inbound pipeline, including spam filtering, Sieve rules, and aliases.

Cloudflare Email Routing -> Email Worker -> Workers VPC -> Cloudflare Tunnel -> private SMTP server

## Why

This lets the mail server keep its full inbound pipeline without exposing port 25 to the public internet. The SMTP hop is inside the tunnel, so the Worker does not use STARTTLS or AUTH.

## Setup

1. Run the Cloudflare Tunnel connector where it can reach the mail server. For Docker deployments, the tunnel container must share a Docker network with the mail server container.
2. In `wrangler.jsonc`, set `vpc_networks[0].tunnel_id` to your Cloudflare Tunnel ID.
3. Set `vars.SMTP_ADDRESS` to the private SMTP endpoint, for example `stalwart:25`.
4. Deploy with `npm run deploy`.
5. In Cloudflare Email Routing, point a rule or catch-all address at the Worker.

Pushes to `main` are tested and deployed by GitHub Actions. That needs two repository secrets: `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` for an account-scoped token with these permissions:

- Workers Scripts Write
- Account Settings Read
- Connectivity Directory Admin (binding directly to a tunnel requires Admin, not Bind)
- Cloudflare Tunnel Read
- Cloudflare One Connector: cloudflared Read
- Cloudflare One Connectors Read
- Cloudflare One Networks Read

## Failure Behavior

Permanent SMTP `5xx` replies reject the Email Routing message, which makes Cloudflare bounce it to the sender. Temporary `4xx` replies, connection failures, and early connection closes are thrown as errors so the delivery fails instead of silently disappearing; whether the sending server retries depends on how Cloudflare reports the failure.

Workers VPC is currently in beta. The mail server sees the tunnel connector as the client IP, so IP-based SPF checks at the private server are meaningless; configure the server to trust Cloudflare's upstream checks instead.

## License

AGPL-3.0-or-later
