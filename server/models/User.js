const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["candidate", "recruiter", "admin"],
      default: "candidate",
    },

    phone: {
      type: String,
      default: "",
    },

    profileImage: {
      type: String,
      default: "",
    },
    savedJobs: [
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
    },],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);