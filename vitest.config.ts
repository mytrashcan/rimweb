import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 시뮬레이션 통합 테스트(게임 내 수십 초 펌핑)는 로컬에서도 3~4초씩 걸린다.
    // 느린 CI 러너에서 기본값 5초를 넘겨 실패하지 않도록 여유를 둔다.
    testTimeout: 30000,
  },
});
