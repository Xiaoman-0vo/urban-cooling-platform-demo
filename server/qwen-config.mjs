export const QWEN_DEFAULTS=Object.freeze({baseUrl:'http://127.0.0.1:18084/v1',model:'epoch_2',specialistModel:'base'});

export function qwenConfig(env=process.env) {
  return {baseUrl:env.QWEN_BASE_URL||QWEN_DEFAULTS.baseUrl,model:env.QWEN_MODEL||QWEN_DEFAULTS.model,
    specialistModel:env.QWEN_SPECIALIST_MODEL||QWEN_DEFAULTS.specialistModel,apiKey:env.QWEN_API_KEY||''};
}
