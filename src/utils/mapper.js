export const publicUser = (u, self = false) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  university: u.university,
  faculty: u.faculty,
  bio: u.bio,
  emailVerified: u.email_verified,
  phoneVerified: u.phone_verified,
  createdAt: u.created_at,
  ...(self ? { email: u.email, phone: u.phone, isBanned: u.is_banned } : {}),
});
