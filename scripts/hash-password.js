import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Foydalanish: npm run hash-password -- "parol"');
  process.exit(1);
}
console.log(await bcrypt.hash(password, 12));
