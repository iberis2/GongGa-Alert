import { getKakaoConfig } from "../lib/config";
import { refreshKakaoAccessToken } from "../lib/kakao";

const config = getKakaoConfig();
const result = await refreshKakaoAccessToken(config);

console.log("Kakao access token refreshed.");
console.log(`access_token=${result.accessToken}`);

if (result.refreshToken) {
  console.log("A new refresh token was returned. Update GitHub Secret KAKAO_REFRESH_TOKEN with this value:");
  console.log(`refresh_token=${result.refreshToken}`);
} else {
  console.log("No new refresh token was returned. Keep the existing KAKAO_REFRESH_TOKEN.");
}
