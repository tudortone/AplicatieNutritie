const { task } = require('@trigger.dev/sdk/v3');

exports.analizaMancareTask = task({
  id: "analiza-mancare-ai",
  run: async (payload, { ctx }) => {
    console.log("🚀 Trigger.dev Task Rulat — Analiza Mancare AI:", payload);
    return {
      success: true,
      imageUrl: payload.imageUrl,
      tipMasa: payload.tipMasa,
      userId: payload.userId,
      processedAt: new Date().toISOString()
    };
  },
});
