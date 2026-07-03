import type { ApifyTikTokResult } from "@/types";

/**
 * Mock Apify 数据(开发期不开 Apify 配额也能跑流程)
 * 每次调用返回固定形状的"假视频"数据
 */
export function mockApifyVideo(videoUrl: string): ApifyTikTokResult {
  const id = `mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  return {
    id,
    text: "【Mock】这是一个测试视频的标题 — 前 3 秒视觉冲击 + 痛点提问",
    createTime: new Date().toISOString(),
    authorMeta: {
      id: "mock_author",
      name: "mock_user",
      nickName: "Mock 博主",
      avatar: "https://picsum.photos/200/200",
    },
    videoMeta: {
      duration: 30,
      coverUrl: "https://picsum.photos/720/1280",
      downloadUrl: "", // Mock 没有真实下载链接,Pipeline Step 2 走封面降级
    },
    webVideoUrl: videoUrl,
    diggCount: 12345,
    shareCount: 567,
    commentCount: 89,
    playCount: 567890,
    collectCount: 234,
    hashtags: [{ name: "mock" }, { name: "test" }],
    textExtra: [{ text: "这是 Apify mock 返回的字幕" }],
  };
}
