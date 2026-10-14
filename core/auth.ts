import type { PublicUser, Role, UserStatus } from "@shared/types";
import type { Store, UserRecord } from "./store";
import { safeEqual, type Platform } from "./platform";

export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password: string): void {
  if (password.length < 6) throw new AppError("WEAK_PASSWORD", "A senha precisa ter pelo menos 6 caracteres.");
  if (password.length > 128) throw new AppError("WEAK_PASSWORD", "A senha é longa demais.");
}

function validateUsername(username: string): void {
  if (!USERNAME_RE.test(username)) {
    throw new AppError("INVALID_USERNAME", "O usuário deve ter de 3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado.");
  }
}

function validateName(name: string): void {
  if (name.trim().length < 2) throw new AppError("INVALID_NAME", "Informe seu nome.");
}

const attempts = new Map<string, { count: number; until: number }>();

export interface NewUserInput {
  name: string;
  username: string;
  password: string;
  email?: string;
  role?: Role;
}

export class AuthService {
  constructor(private store: Store, private platform: Platform) {}

  private hashPassword(password: string, salt = this.platform.randomHex(16)): { hash: string; salt: string } {
    return { hash: this.platform.hashPassword(password, salt), salt };
  }

  private verifyPassword(password: string, salt: string, hash: string): boolean {
    return safeEqual(this.platform.hashPassword(password, salt), hash);
  }

  /** Usados pela nuvem para guardar a senha também neste aparelho (login sem internet). */
  readonly localPassword = {
    verify: (u: UserRecord, pw: string) => this.verifyPassword(pw, u.salt, u.passwordHash),
    hash: (pw: string) => this.hashPassword(pw),
  };

  hasUsers(): boolean {
    return this.store.users.length > 0;
  }

  private ensureUnique(username: string, exceptId?: string): void {
    const existing = this.store.findUserByUsername(username);
    if (existing && existing.id !== exceptId) {
      throw new AppError("USERNAME_TAKEN", "Esse nome de usuário já está em uso. Escolha outro.");
    }
  }

  private create(input: NewUserInput, role: Role): UserRecord {
    const username = input.username.trim();
    validateName(input.name);
    validateUsername(username);
    validatePassword(input.password);
    if (input.email && !EMAIL_RE.test(input.email.trim())) throw new AppError("INVALID_EMAIL", "E-mail inválido.");
    this.ensureUnique(username);
    const { hash, salt } = this.hashPassword(input.password);
    const user: UserRecord = {
      id: globalThis.crypto.randomUUID(),
      name: input.name.trim(),
      username,
      usernameLower: username.toLowerCase(),
      email: input.email?.trim() || undefined,
      role,
      status: "ativo",
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
      avatarHue: Math.floor(Math.random() * 360),
    };
    this.store.addUser(user);
    return user;
  }

  register(input: NewUserInput): PublicUser {
    const role: Role = this.hasUsers() ? "usuario" : "dono";
    const user = this.create(input, role);
    user.lastLoginAt = new Date().toISOString();
    this.store.save();
    return this.store.toPublic(user);
  }

  // Um login só: o cargo vem da conta e decide o que a pessoa vê dentro do app.
  login(username: string, password: string): PublicUser {
    const key = username.trim().toLowerCase();
    const lock = attempts.get(key);
    if (lock && lock.until > Date.now()) {
      const secs = Math.ceil((lock.until - Date.now()) / 1000);
      throw new AppError("LOCKED", `Muitas tentativas. Aguarde ${secs} segundos e tente novamente.`);
    }
    const user = this.store.findUserByUsername(username);
    // Mesma resposta (e o mesmo trabalho de conferir senha) para usuário que não
    // existe e senha errada: assim ninguém descobre quais usuários existem.
    const ok = user ? this.verifyPassword(password, user.salt, user.passwordHash) : (this.hashPassword(password), false);
    if (!user || !ok) {
      const count = (lock?.count ?? 0) + 1;
      // A partir da 5ª tentativa errada, espera 30 s, depois 1, 2, 4… minutos (até 15).
      const wait = count >= 5 ? Math.min(15 * 60_000, 30_000 * 2 ** (count - 5)) : 0;
      attempts.set(key, { count, until: wait ? Date.now() + wait : 0 });
      throw new AppError("WRONG_PASSWORD", wait ? `Usuário ou senha incorretos. Muitas tentativas: aguarde ${Math.ceil(wait / 1000)} segundos.` : "Usuário ou senha incorretos.");
    }
    attempts.delete(key);
    if (user.status === "bloqueado") throw new AppError("BLOCKED", "Esta conta está bloqueada. Fale com o dono do aplicativo.");
    user.lastLoginAt = new Date().toISOString();
    this.store.save();
    return this.store.toPublic(user);
  }

  changePassword(userId: string, current: string, next: string): void {
    const user = this.store.findUser(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.");
    if (!this.verifyPassword(current, user.salt, user.passwordHash)) throw new AppError("WRONG_PASSWORD", "A senha atual está incorreta.");
    validatePassword(next);
    const { hash, salt } = this.hashPassword(next);
    user.passwordHash = hash;
    user.salt = salt;
    this.store.save();
  }

  updateOwnProfile(userId: string, patch: { name?: string; email?: string; username?: string }): PublicUser {
    const user = this.store.findUser(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.");
    if (patch.name !== undefined) {
      validateName(patch.name);
      user.name = patch.name.trim();
    }
    if (patch.email !== undefined) {
      const e = patch.email.trim();
      if (e && !EMAIL_RE.test(e)) throw new AppError("INVALID_EMAIL", "E-mail inválido.");
      user.email = e || undefined;
    }
    if (patch.username !== undefined && patch.username.trim() !== user.username) {
      const u = patch.username.trim();
      validateUsername(u);
      this.ensureUnique(u, user.id);
      user.username = u;
      user.usernameLower = u.toLowerCase();
    }
    this.store.save();
    return this.store.toPublic(user);
  }

  validateNew(input: NewUserInput): void {
    validateName(String(input.name ?? ""));
    validateUsername(String(input.username ?? "").trim());
    validatePassword(String(input.password ?? ""));
    if (input.email && !EMAIL_RE.test(input.email.trim())) throw new AppError("INVALID_EMAIL", "E-mail inválido.");
  }

  validatePasswordOnly(password: string): void {
    validatePassword(password);
  }

  requireManager(actorId: string): UserRecord {
    return this.actor(actorId);
  }

  // ---- administração ----
  private actor(actorId: string): UserRecord {
    const actor = this.store.findUser(actorId);
    if (!actor || (actor.role !== "dono" && actor.role !== "adm")) {
      throw new AppError("FORBIDDEN", "Você não tem permissão para gerenciar usuários.");
    }
    return actor;
  }

  private canManage(actor: UserRecord, target: UserRecord): boolean {
    if (actor.role === "dono") return true;
    return target.role === "usuario";
  }

  private owners(): number {
    return this.store.users.filter((u) => u.role === "dono").length;
  }

  listUsers(actorId: string): PublicUser[] {
    this.actor(actorId);
    return this.store.users.map((u) => this.store.toPublic(u));
  }

  createUser(actorId: string, input: NewUserInput): PublicUser {
    const actor = this.actor(actorId);
    const role = input.role ?? "usuario";
    if (actor.role === "adm" && role !== "usuario") throw new AppError("FORBIDDEN", "Administradores só podem criar contas de Usuário.");
    return this.store.toPublic(this.create(input, role));
  }

  updateUser(
    actorId: string,
    id: string,
    patch: { name?: string; username?: string; email?: string; role?: Role; status?: UserStatus }
  ): PublicUser {
    const actor = this.actor(actorId);
    const target = this.store.findUser(id);
    if (!target) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.");
    if (!this.canManage(actor, target)) throw new AppError("FORBIDDEN", "Você não pode alterar esta conta.");
    if (patch.role && patch.role !== target.role) {
      if (actor.role !== "dono") throw new AppError("FORBIDDEN", "Apenas o Dono pode mudar cargos.");
      if (target.role === "dono" && this.owners() <= 1) throw new AppError("LAST_OWNER", "O aplicativo precisa ter pelo menos um Dono.");
      target.role = patch.role;
    }
    if (patch.status && patch.status !== target.status) {
      if (target.id === actor.id) throw new AppError("FORBIDDEN", "Você não pode bloquear a própria conta.");
      if (target.role === "dono" && patch.status === "bloqueado" && this.owners() <= 1) {
        throw new AppError("LAST_OWNER", "Não é possível bloquear o único Dono.");
      }
      target.status = patch.status;
    }
    if (patch.name !== undefined) {
      validateName(patch.name);
      target.name = patch.name.trim();
    }
    if (patch.email !== undefined) {
      const e = patch.email.trim();
      if (e && !EMAIL_RE.test(e)) throw new AppError("INVALID_EMAIL", "E-mail inválido.");
      target.email = e || undefined;
    }
    if (patch.username !== undefined && patch.username.trim() !== target.username) {
      const u = patch.username.trim();
      validateUsername(u);
      this.ensureUnique(u, target.id);
      target.username = u;
      target.usernameLower = u.toLowerCase();
    }
    this.store.save();
    return this.store.toPublic(target);
  }

  resetPassword(actorId: string, id: string, newPassword: string): void {
    const actor = this.actor(actorId);
    const target = this.store.findUser(id);
    if (!target) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.");
    if (!this.canManage(actor, target)) throw new AppError("FORBIDDEN", "Você não pode alterar a senha desta conta.");
    validatePassword(newPassword);
    const { hash, salt } = this.hashPassword(newPassword);
    target.passwordHash = hash;
    target.salt = salt;
    attempts.delete(target.usernameLower);
    this.store.save();
  }

  deleteUser(actorId: string, id: string): void {
    const actor = this.actor(actorId);
    const target = this.store.findUser(id);
    if (!target) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.");
    if (target.id === actor.id) throw new AppError("FORBIDDEN", "Você não pode excluir a própria conta por aqui.");
    if (!this.canManage(actor, target)) throw new AppError("FORBIDDEN", "Você não pode excluir esta conta.");
    if (target.role === "dono" && this.owners() <= 1) throw new AppError("LAST_OWNER", "O aplicativo precisa ter pelo menos um Dono.");
    this.store.removeUser(id);
  }
}
