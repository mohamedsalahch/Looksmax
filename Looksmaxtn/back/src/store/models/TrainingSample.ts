import mongoose, { Document, Model, Schema } from "mongoose";

export type TrainingFlow =
  | "outfit"
  | "garment_enhance"
  | "accessory_enhance"
  | "model_generation"
  | "photo_validation"
  | "compare_front_back";

export interface ITrainingSample extends Document {
  flow: TrainingFlow;
  jobId?: string;
  user?: mongoose.Types.ObjectId;
  modelName: string;
  promptVersion: string;
  promptText: string;
  modelParams?: Record<string, unknown>;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  extra?: Record<string, unknown>;
  latencyMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const trainingSampleSchema = new Schema<ITrainingSample>(
  {
    flow: {
      type: String,
      enum: [
        "outfit",
        "garment_enhance",
        "accessory_enhance",
        "model_generation",
        "photo_validation",
        "compare_front_back",
      ],
      required: true,
      index: true,
    },
    jobId: { type: String, default: "", index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    modelName: { type: String, required: true },
    promptVersion: { type: String, required: true, index: true },
    promptText: { type: String, required: true },
    modelParams: { type: Schema.Types.Mixed, default: null },
    inputs: { type: Schema.Types.Mixed, default: {} },
    outputs: { type: Schema.Types.Mixed, default: {} },
    extra: { type: Schema.Types.Mixed, default: null },
    latencyMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

trainingSampleSchema.index({ flow: 1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.TrainingSample) {
  delete mongoose.models.TrainingSample;
}

const TrainingSample: Model<ITrainingSample> =
  mongoose.models.TrainingSample ||
  mongoose.model<ITrainingSample>("TrainingSample", trainingSampleSchema);

export default TrainingSample;
