#!/usr/bin/env node

/**
 * Interactive script to update MapKit JS token
 * Run: node update-mapkit-key.cjs
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Check for jsonwebtoken dependency
let jwt;
try {
  jwt = require('jsonwebtoken');
} catch (e) {
  console.error('\n❌ Missing dependency: jsonwebtoken');
  console.error('   Run: npm install jsonwebtoken\n');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

const TEAM_ID = '537K9EAFPG'; // Your Apple Team ID

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║              MapKit JS Token Update Script                     ║
╚════════════════════════════════════════════════════════════════╝

This script will help you generate a new MapKit JS JWT token.

BEFORE YOU START:
─────────────────
1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click "+" to create a new key (or use an existing one)
3. Enable "MapKit JS" for the key
4. Download the .p8 file (you can only download it ONCE!)
5. Note the Key ID shown on the page (also in the filename: AuthKey_XXXXXX.p8)

Your Team ID: ${TEAM_ID}
`);

  // Step 1: Get private key
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('STEP 1: Private Key');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Open your .p8 file in a text editor. It looks like this:');
  console.log('');
  console.log('  -----BEGIN PRIVATE KEY-----');
  console.log('  MIGTAgEAMBMGByqGSM49AgEGCC...(base64 content)...');
  console.log('  -----END PRIVATE KEY-----');
  console.log('');
  console.log('Copy ONLY the base64 content (the middle part, without the');
  console.log('BEGIN/END lines). Paste it below as a single line:');
  console.log('');

  const privateKeyBase64 = await question('> ');

  if (!privateKeyBase64 || privateKeyBase64.length < 50) {
    console.error('\n❌ Invalid private key. Should be a long base64 string.\n');
    rl.close();
    process.exit(1);
  }

  // Format the private key properly (split into 64-char lines)
  const formattedKey = privateKeyBase64.match(/.{1,64}/g).join('\n');
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;

  // Step 2: Get Key ID
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('STEP 2: Key ID');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Enter the Key ID (10 characters, found in the .p8 filename');
  console.log('or on the Apple Developer portal). Example: U475SCX6UX');
  console.log('');

  const keyId = await question('> ');

  if (!keyId || keyId.length !== 10) {
    console.error('\n❌ Invalid Key ID. Should be exactly 10 characters.\n');
    rl.close();
    process.exit(1);
  }

  // Step 3: Generate token
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('STEP 3: Generating Token...');
  console.log('─────────────────────────────────────────────────────────────────');

  let token;
  try {
    token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '180d',
      issuer: TEAM_ID,
      header: {
        kid: keyId,
        typ: 'JWT',
        alg: 'ES256'
      }
    });
  } catch (e) {
    console.error('\n❌ Failed to generate token. Check your private key.');
    console.error(`   Error: ${e.message}\n`);
    rl.close();
    process.exit(1);
  }

  // Decode and show expiry
  const decoded = jwt.decode(token);
  const expiryDate = new Date(decoded.exp * 1000);

  console.log('');
  console.log('✅ Token generated successfully!');
  console.log(`   Expires: ${expiryDate.toLocaleDateString()} (180 days)`);
  console.log('');
  console.log('Token:');
  console.log('───────');
  console.log(token);
  console.log('───────');

  // Step 4: Update .env
  console.log('');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('STEP 4: Update .env file');
  console.log('─────────────────────────────────────────────────────────────────');

  const envPath = path.join(__dirname, '.env');
  const envExists = fs.existsSync(envPath);

  if (envExists) {
    console.log(`Found: ${envPath}`);
  } else {
    console.log(`Will create: ${envPath}`);
  }
  console.log('');

  const updateEnv = await question('Update .env file with new token? (Y/n) > ');

  if (updateEnv.toLowerCase() !== 'n') {
    const envContent = `VITE_MAPKIT_TOKEN=${token}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log('');
    console.log('✅ .env file updated!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Restart your dev server: npm run dev');
    console.log('  2. Test that the map loads correctly');
  } else {
    console.log('');
    console.log('Skipped. Copy the token above manually to your .env file:');
    console.log(`  VITE_MAPKIT_TOKEN=${token}`);
  }

  console.log('');
  console.log('Done! 🎉');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('Error:', err);
  rl.close();
  process.exit(1);
});
