import { db } from "./db";
import { rooms, type Room, type InsertRoom } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  createRoom(room: InsertRoom): Promise<Room>;
  getRoom(id: string): Promise<Room | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const [room] = await db.insert(rooms).values(insertRoom).returning();
    return room;
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }
}

export const storage = new DatabaseStorage();