const Chat = require("../Models/chat.model.js");
const User = require("../Models/user.model.js");
const ApiError = require("../Utils/ApiError.js");
const asyncHandler = require("../Utils/asyncHandler.js");
const { ChatEventEnum } = require("../constants.js");
const { emitSocketEvent } = require("../socket/index.js");

const chatCommonAggregation = () => {
  return [
    {
      // lookup fr participants
      $lookup: {
        from: "users",
        foreignFeild: "_id",
        localFeild: "participants",
        as: "participants",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "messages",
        foreignFeild: "_id",
        localFeild: "lastMessage",
        as: "lastMessage",
        pipeline: [
          {
            $lookup: {
              from: "users",
              foreignFeild: "_id",
              localFeild: "sender",
              as: "sender",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    avatar: 1,
                    email: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              sender: { $first: "$sender" },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        lastMessage: { $first: "$lastMessage" },
      },
    },
  ];
};

const createOrGetOneOnOneChat = asyncHandler(async (req, res) => {
  const { receiverId } = req.params;

  // check if id is valid
  const receiver = await User.findById(receiverId);
  if (!receiver) {
    throw new ApiError(404, "Receiver does not exist");
  }
  // check is receiver is not the user requesting the chat
  if (receiver._id.toString() == req.user._id.toString()) {
    throw new ApiError(400, "You cannot chat with yourself");
  }

  const chat = await Chat.aggregate([
    {
      $match: {
        isGroupChat: false,
        $and: [
          {
            participants: { $elemMatch: { $eq: req.user._id } },
          },
          {
            participants: { $elemMatch: { $eq: receiver._id } },
          },
        ],
      },
    },
    ...chatCommonAggregation(),
  ]);

  if (chat.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, chat[0], "Chat retrieved successfully"));
  }

  const newOneOnOneChat = await Chat.create({
    name: "one on one chat",
    participants: [req.user._id, reciever._id],
    admin: req.user._id,
  });

  // structure the chat as per the common aggregation to keep the consistency
  const createdChat = await Chat.aggregate([
    {
      $match: {
        _id: newChatInstance._id,
      },
    },
    ...chatCommonAggregation(),
  ]);

  const payload = createdChat[0]; // store the aggregation result

  if (!payload) {
    throw new ApiError(500, "Internal server error");
  }

  // logic to emit socket event about the new chat added to the participants
  payload?.participants?.forEach((participant) => {
    if (participant._id.toString() === req.user._id.toString()) return; // don't emit the event for the logged in use as he is the one who is initiating the chat

    // emit event to other participants with new chat as a payload
    emitSocketEvent(
      req,
      participant._id?.toString(),
      ChatEventEnum.NEW_CHAT_EVENT,
      payload
    );
  });

  return res
    .status(201)
    .json(new ApiResponse(201, payload, "Chat retrieved successfully"));
});

const createAGroupChat = asyncHandler(async (req, res) => {
  const { name, participants } = req.body;
  // Check if user is not sending himself as a participant. This will be done manually
  if (participants.includes(req.user._id.toString())) {
    throw new ApiError(
      400,
      "Participants array should not contain the group creator"
    );
  }

  const members = [...new Set([...participants, req.user._id.toString()])]; // check for duplicates

  if (members.length < 3) {
    // check after removing the duplicate
    // We want group chat to have minimum 3 members including admin
    throw new ApiError(
      400,
      "Group chat should have atleast 2 members other unique members."
    );
  }

  // Create a group chat with provided members
  const groupChat = await Chat.create({
    name,
    isGroupChat: true,
    participants: members,
    admin: req.user._id,
  });

  // structure the chat
  const chat = await Chat.aggregate([
    {
      $match: {
        _id: groupChat._id,
      },
    },
    ...chatCommonAggregation(),
  ]);

  const payload = chat[0];

  if (!payload) {
    throw new ApiError(500, "Internal server error");
  }

  // logic to emit socket event about the new group chat added to the participants
  payload?.participants?.forEach((participant) => {
    if (participant._id.toString() === req.user._id.toString()) return; // don't emit the event for the logged in use as he is the one who is initiating the chat
    // emit event to other participants with new chat as a payload
    emitSocketEvent(
      req,
      participant._id?.toString(),
      ChatEventEnum.NEW_CHAT_EVENT,
      payload
    );
  });

  return res
    .status(201)
    .json(new ApiResponse(201, payload, "Group chat created successfully"));
});
module.exports = {
  createOrGetOneOnOneChat,
  createAGroupChat,
};
