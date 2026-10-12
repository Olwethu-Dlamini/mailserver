# Running My Own Mail Server From Behind CGNAT

A guide series on adding a real `@22112002.xyz` mailbox to the homelab described in
[Homelab](https://github.com/Olwethu-Dlamini/Homelab): a Debian VM on Proxmox with no public IP,
already serving websites through Caddy and a Cloudflare Tunnel.

Built on 8 October 2026. The morning plan rented a VPS as the public-facing half; the budget for
that was zero, so the afternoon replaced it with a design that costs nothing: Cloudflare Email
Routing plus an Email Worker that connects back through my own tunnel for receiving, and a Resend
relay for sending. Both directions carried real mail to and from Gmail the same day.

Open `index.html` in a browser, or start with the first page.

## Pages

| # | Page | What it covers |
|---|------|----------------|
| 01 | [Why a tunnel can't carry mail](01-the-problem.html) | HTTP vs SMTP, CGNAT again, pushed vs pulled protocols |
| 02 | [How email actually works](02-how-email-works.html) | The life of one message, ports, the SMTP conversation |
| 03 | [DNS and trust](03-dns-and-trust.html) | MX, PTR, SPF, DKIM, DMARC, MTA-STS, DANE |
| 04 | [Stalwart, and the stacks I didn't pick](04-stalwart.html) | How Stalwart works; why not Postfix+Dovecot, Mailcow, docker-mailserver |
| 05 | [The front door, second attempt](05-the-front-door.html) | Why the VPS was never bought, every free alternative checked, and the Cloudflare + Worker + Resend design with its trade-offs |
| 06 | [Roundcube behind the tunnel](06-roundcube.html) | Webmail on the existing PHP/MariaDB/Caddy stack |
| 07 | [Build part 1: everything at home](07-build-home.html) | Built 8 October 2026 (morning): Stalwart, domain, wildcard certificate via DNS-01, Roundcube, accounts, tested over Tailscale. Raw notes in `notes/build-log-2026-10-08.md` |
| 08 | [Build part 2: the free front door, as built](08-build-front-door.html) | Built 8 October 2026 (afternoon): JMAP through the tunnel, the Worker, Resend, the MX handover to Email Routing, first messages both ways |
| 09 | [Testing and troubleshooting](09-testing.html) | One command per hop, the faults met on the day |
| 10 | [Improving the system as built](10-improvements.html) | Evidence from three days of running: Junk false positives, a Worker fallback, the Resend quota, off-site backups, alerting, listeners |
| 11 | [What you can do with it](11-what-you-can-do.html) | Per-service addresses, Sieve, homelab alerts, sending from apps (SMTP or Resend API), CalDAV/CardDAV, Worker automation |
| 12 | [What others do](12-what-others-do.html) | Other Cloudflare-to-home bridges, VPS + WireGuard relays, Stalwart relay/auto-ban/backup practice, monitoring, free sending services |
| — | [Glossary](glossary.html) | Every term |

The Email Worker lives in [`worker/`](worker/), vendored from
[Lumysia/email-smtp-bridge](https://github.com/Lumysia/email-smtp-bridge) (AGPL-3.0) with the
tunnel id and SMTP address changed.

## Architecture in one line

```
Inbound:  Internet ──25──▶ Cloudflare Email Routing ──▶ Email Worker ──VPC──▶ homelab tunnel ──▶ Stalwart 127.0.0.1:25 on srv1
Outbound: Stalwart on srv1 ──465 + API key──▶ smtp.resend.com ──25──▶ Internet
Clients:  browser / phone ──HTTPS──▶ Cloudflare Tunnel ──▶ Caddy ──▶ Roundcube (IMAP on loopback) or JMAP at mail.22112002.xyz
```

## License

Apache 2.0, see [LICENSE](LICENSE). The `worker/` directory is AGPL-3.0, see `worker/LICENSE`.
