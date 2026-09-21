#!/usr/bin/env bun
/**
 * Mint auth material for a self-hosted libsql-server (sqld) instance.
 *
 * Fresh keypair plus tokens:   bun run db:tokens
 * Tokens from an existing key: bun run db:tokens -- --key private-key.pem
 * Expiring tokens:             bun run db:tokens -- --expires 30d
 *
 * The public key goes into the libsql service's SQLD_AUTH_JWT_KEY (for example in
 * docker-compose). The RW token becomes DATABASE_AUTH_TOKEN on the web and worker
 * services; the RO token is for local, read-only access to the same database. Store
 * the private key in a password manager — it is only needed to mint future tokens
 * and never ships.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, SignJWT } from "jose";

const { values } = parseArgs({
	options: {
		key: { type: "string" },
		expires: { type: "string" },
		out: { type: "string" },
	},
});

let privateKey: CryptoKey;
let keypairPems: { publicPem: string; privatePem: string } | undefined;
if (values.key) {
	privateKey = await importPKCS8(readFileSync(values.key, "utf8"), "EdDSA");
} else {
	const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
	privateKey = pair.privateKey;
	keypairPems = {
		publicPem: await exportSPKI(pair.publicKey),
		privatePem: await exportPKCS8(pair.privateKey),
	};
}

async function mint(claims: Record<string, string>) {
	const jwt = new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", typ: "JWT" }).setIssuedAt();
	if (values.expires) jwt.setExpirationTime(values.expires);
	return jwt.sign(privateKey);
}

if (keypairPems) {
	if (values.out) {
		const publicPath = join(values.out, "libsql-public.pem");
		const privatePath = join(values.out, "libsql-private.pem");
		writeFileSync(publicPath, keypairPems.publicPem);
		writeFileSync(privatePath, keypairPems.privatePem, { mode: 0o600 });
		console.log(`── Public key → SQLD_AUTH_JWT_KEY on the libsql service ──\n${publicPath}\n`);
		console.log("── Private key → move to a password manager, then delete the file ──");
		console.log(`${privatePath}\n`);
	} else {
		console.log("── Public key → SQLD_AUTH_JWT_KEY on the libsql service ──");
		console.log(keypairPems.publicPem);
		console.log("── Private key → password manager only, never deploy ──");
		console.log(keypairPems.privatePem);
	}
}
console.log("── Read-write token → DATABASE_AUTH_TOKEN on web and worker ──");
console.log(await mint({}));
console.log();
console.log("── Read-only token → DATABASE_AUTH_TOKEN in local .env.local ──");
console.log(await mint({ a: "ro" }));
console.log();
console.log(
	values.expires
		? `Tokens expire in ${values.expires}.`
		: "Tokens do not expire; pass --expires 30d to mint short-lived ones.",
);
