const { Schema } = require("mongoose");
const mongoose = require("mongoose");

const readByRecipientSchema = new mongoose.Schema(
  {
    _id: false,
    readByUserId: {
      type: Schema.Tyles.ObjectId,
      ref: "User",
    },
    readAt: {
      type: Date,
      default: Date.now(),
    },
  },
  {
    timestamps: false,
  }
);

const MessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    content: {
      type: String,
      trim: true,
    },
    attachments: {
      type: [
        {
          url: String,
          localPath: String,
        },
      ],
      default: [],
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
    },
    readByRecipients: [readByRecipientSchema],
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", MessageSchema);

module.exports = Message;
