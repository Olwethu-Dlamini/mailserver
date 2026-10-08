# Running My Own Mail Server From Behind CGNAT

A guide series on adding a real `@22112002.xyz` mailbox to the homelab described in
[Homelab](https://github.com/Olwethu-Dlamini/Homelab): a Debian VM on Proxmox with no public IP,
already serving websites through Caddy and a Cloudflare Tunnel.

Open `index.html` in a browser, or start with the first page.

## Pages

| # | Page | What it covers |
|---|------|----------------|
| 01 | [Why a tunnel can't carry mail](01-the-problem.html) | HTTP vs SMTP, CGNAT again, pushed vs pulled protocols |
| 02 | [How email actually works](02-how-email-works.html) | The life of one message, ports, the SMTP conversation |
| 03 | [DNS and trust](03-dns-and-trust.html) | MX, PTR, SPF, DKIM, DMARC, MTA-STS, DANE |
| 04 | [Stalwart, and the stacks I didn't pick](04-stalwart.html) | How Stalwart works; why not Postfix+Dovecot, Mailcow, docker-mailserver |
| 05 | [The front door](05-the-front-door.html) | A relay VPS, HAProxy + PROXY protocol, Postfix outbound, over Tailscale |
| 06 | [Roundcube behind the tunnel](06-roundcube.html) | Webmail on the existing PHP/MariaDB/Caddy stack |
| 07 | [Build part 1: everything at home](07-build-home.html) | Stalwart, domain, certificates, accounts, Roundcube, tested over Tailscale |
| 08 | [Build part 2: the front door](08-build-front-door.html) | The VPS, port 25, PTR, HAProxy, Postfix, DNS, first message to Gmail |
| 09 | [Testing and troubleshooting](09-testing.html) | One command per layer |
| — | [Glossary](glossary.html) | Every term |

## Architecture in one line

```
Internet ──25/465/993──▶ rented VPS (HAProxy, PROXY v2) ──Tailscale──▶ Stalwart on srv1 @ home
Outbound:                 srv1 ──Tailscale──▶ Postfix on VPS ──▶ Internet
Webmail:                  browser ──▶ Cloudflare Tunnel ──▶ Caddy ──▶ Roundcube ──loopback IMAP──▶ Stalwart
```

## License

Apache 2.0, see [LICENSE](LICENSE).
