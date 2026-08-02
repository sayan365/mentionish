export const aiRoles = {
  classification: {
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    store: false,
  },
  drafting: { model: "gpt-5.6-terra", reasoningEffort: "low", store: false },
} as const;

export type AiRole = keyof typeof aiRoles;
