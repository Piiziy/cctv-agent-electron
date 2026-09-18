/**
 * app.json 을 그대로 쓰되, EAS 프로젝트 ID 만 환경변수로 덧붙인다.
 * 이 값이 있어야 실기기에서 Expo 푸시 토큰이 발급된다 (`eas init` 이 만들어 준다).
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      ...(process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {}),
    },
  },
})
