const crypto = require('crypto');


const algorithm = 'aes-256-cbc';

// Encrypt function
async function encrypt(text, key) {
  let iv = crypto.randomBytes(16);
  let cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decrypt function
async function decrypt(text, key) {
  let parts = text.split(':');
  let iv = Buffer.from(parts.shift(), 'hex');
  let encryptedText = Buffer.from(parts.join(':'), 'hex');
  let decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };
