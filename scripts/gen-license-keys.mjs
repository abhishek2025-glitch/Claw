#!/usr/bin/env node
/**
 * Generates an Ed25519 keypair for AgentShield offline license verification.
 * 
 * WARNING: NEVER commit the private key to version control or expose it publicly.
 * Keep LICENSE_SIGNING_PRIVATE_KEY secure on your authoritative server / deployment environment.
 */

import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const escapedPublicKey = publicKeyPem.trim().replace(/\n/g, '\\n');
const escapedPrivateKey = privateKeyPem.trim().replace(/\n/g, '\\n');

console.log('='.repeat(70));
console.log(' AgentShield Ed25519 Cryptographic License Key Generator');
console.log('='.repeat(70));
console.log('\n[CRITICAL SECURITY WARNING]');
console.log('NEVER commit your private key to any repository or client-side application!');
console.log('Only store LICENSE_SIGNING_PRIVATE_KEY in your secure server environment variables.\n');

console.log('--- 1. PUBLIC KEY (PEM) ---');
console.log(publicKeyPem);

console.log('--- 2. PRIVATE KEY (PEM) ---');
console.log(privateKeyPem);

console.log('--- 3. ONE-LINE ESCAPED ENVIRONMENT VARIABLES (.env) ---');
console.log(`AGENTSHIELD_LICENSE_PUBLIC_KEY="${escapedPublicKey}"`);
console.log(`LICENSE_SIGNING_PRIVATE_KEY="${escapedPrivateKey}"`);
console.log('='.repeat(70));
