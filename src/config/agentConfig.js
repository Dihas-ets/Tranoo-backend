/**
 * Règles agents commerciaux (présence journalière, bonus, etc.)
 */
module.exports = {
  /** Prime créditée une fois par jour lorsque la localisation GPS est enregistrée. */
  DAILY_PRESENCE_BONUS_XOF: Number(process.env.AGENT_DAILY_PRESENCE_BONUS_XOF || 2000),
};
