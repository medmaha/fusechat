const mongoose = require("mongoose")
const slugify = require("slugify")
const User = require("./users")
const Chat = require("./chat")

const { getChatGPTResponse, promptHeader } = require("../../chatGPT")

if (mongoose.models.Rooms) {
    module.exports = mongoose.model("Rooms")
} else {
    const Schema = new mongoose.Schema({
        name: { type: String, unique: true, capitalize: true },

        slug: { type: String, unique: true },

        description: { type: String, capitalize: true },

        isPrivate: { type: Boolean, default: true },

        host: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
        },

        topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topics" },

        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Users",
            },
        ],

        chatfuses: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Chats",
            },
        ],
        createdAt: { type: Date, default: () => Date.now(), immutable: true },
        AI_MODEL: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
        },
    })

    const populateUserRefs = (doc, next) => {
        doc.populate([
            { path: "topic", select: ["_id", "name", "slug"] },
            { path: "host", select: ["_id", "name", "username", "avatar"] },
            { path: "AI_MODEL", select: ["_id", "name", "username", "avatar"] },
            { path: "members", select: ["_id", "name", "username", "avatar"] },
            {
                path: "chatfuses",
                populate: {
                    path: "sender",
                    model: "Users",
                    select: ["_id", "name", "username", "avatar"],
                },
            },
        ])
        doc.select("-AI_MODEL")
        next()
    }

    Schema.pre("save", async function (next) {
        if (this.isNew) {
            const AIUser = new User({
                name: "AI",
                username:
                    "AI-" +
                    new Date().toISOString().split(".")[1] +
                    `${generateId(10)}`,
                email: `${generateId(4)}@AI${generateId(2)}.${
                    new Date().toISOString().split(".")[1] + generateId(3)
                }`,
                avatar: "/images/avatar-ai.png",
            })
            await AIUser.save()

            this.AI_MODEL = AIUser._id

            this.members.push(AIUser._id)
            this.members.push(this.host)
        }
        if (this.isNew || this.isModified("name")) {
            this.slug = slugify(this.name, {
                lower: true,
                truncate: 32,
            })
            const capitalizedName = (name) => {
                let text = name.split("")
                let firstChar = text[0].toUpperCase()

                text[0] = firstChar

                return text.join("")
            }

            this.name = capitalizedName(this.name)
        }
        next()
    })

    Schema.post("save", async function (doc, next) {
        if (doc.chatfuses.length < 1) {
            const aiUser = await User.findOne({ _id: this.AI_MODEL })

            const initialPromptHeader = promptHeader(this) + "ai:"
            const chatGPTIntroduction = await getChatGPTResponse(
                initialPromptHeader,
            )

            if (typeof chatGPTIntroduction === "string") {
                const chat = await Chat.create({
                    fuse: chatGPTIntroduction,
                    sender: aiUser._id,
                    room: this._id,
                })
                doc.chatfuses.push(chat._id)
                doc.save()
            }
        }
        next()
    })

    Schema.pre("find", function (next) {
        populateUserRefs(this, next)
    })

    Schema.pre("findOne", function (next) {
        populateUserRefs(this, next)
    })

    const Room = mongoose.model("Rooms", Schema)
    module.exports = Room
}

function generateId(length = 7) {
    let result = ""
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

    function shuffleArray(array = []) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
        }
        return array
    }

    let data = shuffleArray(characters.split(" ")).join("")
    for (let i = 0; i < length; i++) {
        result += data.charAt(Math.floor(Math.random() * data.length))
    }
    return result
}
