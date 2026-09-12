import type Database from "better-sqlite3";
export class ResidentProfileStore {
  constructor(private readonly database: Database.Database) {}
  save(residentId: string, homeId: string, residentName: string, homeName: string) {
    return this.database.transaction(() => {
      const home = this.database.prepare("SELECT 1 FROM homes WHERE home_id=? AND resident_id=?").get(homeId,residentId);
      if (!home) throw new Error("Resident home mismatch");
      this.database.prepare("UPDATE residents SET resident_name=? WHERE resident_id=?").run(residentName,residentId);
      this.database.prepare("UPDATE homes SET home_name=? WHERE home_id=? AND resident_id=?").run(homeName,homeId,residentId);
      return {resident_name:residentName,home_name:homeName};
    })();
  }
}
