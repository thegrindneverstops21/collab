import bcrypt from "bcryptjs";
import { LoginInput, RegisterInput } from "./auth.schema";
import { pool } from "../../db/pool";

const DUMMY_HASH = bcrypt.hashSync("not_a_real_password", 12);

export async function registerUser(input: RegisterInput) {
    const hash = await bcrypt.hash(input.password, 12);

    try {
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role) 
            VALUES ($1, $2, $3, $4) RETURNING id, name, email, role
            RETURNING id, name, email, role, avatar_url, created_at, updated_at`,
            [input.name, input.email, hash, input.role]
        );
        return result.rows[0];
    } catch (error: any) {
        if (error.code === "23505") {
            throw new Error("Email already exists");
        }
        throw error;
    }
}

export async function loginUser(input: LoginInput){
    
} 