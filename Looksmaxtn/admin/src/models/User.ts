import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string; email: string; password: string; role: "user" | "admin";
  isBlocked?: boolean;
  address?: { street: string; city: string; state: string; zip: string; phone: string; };
  createdAt: Date; updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  isBlocked: { type: Boolean, default: false },
  address: {
    street: { type: String, default: "" }, city: { type: String, default: "" },
    state: { type: String, default: "" }, zip: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
}, { timestamps: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
