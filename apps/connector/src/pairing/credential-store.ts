export interface DeviceCredential {
  deviceId: string;
  deviceToken: string;
}

export interface CredentialStore {
  save(credential: DeviceCredential): Promise<void>;
  read(): Promise<DeviceCredential | null>;
  delete(): Promise<void>;
  probe(): Promise<boolean>;
}

export interface MemoryCredentialStoreOptions {
  writable?: boolean;
  failOnSave?: boolean;
}

export class MemoryCredentialStore implements CredentialStore {
  saved: DeviceCredential | null = null;

  private readonly writable: boolean;
  private readonly failOnSave: boolean;

  constructor(options: MemoryCredentialStoreOptions = {}) {
    this.writable = options.writable ?? true;
    this.failOnSave = options.failOnSave ?? false;
  }

  async save(credential: DeviceCredential): Promise<void> {
    if (!this.writable) {
      throw new Error("Credential store is not writable.");
    }
    if (this.failOnSave) {
      throw new Error("Credential save failed.");
    }

    this.saved = { ...credential };
  }

  async read(): Promise<DeviceCredential | null> {
    return this.saved === null ? null : { ...this.saved };
  }

  async delete(): Promise<void> {
    this.saved = null;
  }

  async probe(): Promise<boolean> {
    return this.writable;
  }
}
