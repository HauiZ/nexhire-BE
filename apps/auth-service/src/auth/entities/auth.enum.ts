export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  LOCKED = 'LOCKED',
  BANNED = 'BANNED',
  ARCHIVED = 'ARCHIVED',
}

export enum PasswordAlgorithm {
  BCRYPT = 'bcrypt',
}

export enum AuthIdentityProvider {
  GOOGLE = 'GOOGLE',
}
