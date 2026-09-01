import process from "node:process"

process.env.AIANG_RUNTIME_PROFILE = "dev"
process.env.AIANG_DISABLE_SELF_UPDATE = "1"
process.env.KANNA_RUNTIME_PROFILE = "dev"
process.env.KANNA_DISABLE_SELF_UPDATE = "1"

await import("../src/server/cli")
