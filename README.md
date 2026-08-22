# 입주대기자 수 알리미

마이홈 예비입주자 대기현황 상세 페이지의 `입주대기자` 수를 확인하고, 이전 값과 달라지면 변경 이력을 저장한 뒤 카카오톡 메시지로 알립니다.

## 실행

```bash
pnpm install
pnpm dev
```

대시보드는 기본적으로 `http://localhost:3000`에서 확인합니다.

## 모니터 실행

```bash
pnpm monitor:once
pnpm monitor
```

- `monitor:once`: 현재 감시 대상 URL을 1회 확인합니다.
- `monitor`: 실행 즉시 1회 확인한 뒤 1시간마다 반복 확인합니다.
- 최초 실행은 기준값만 저장하고 카카오톡 알림은 보내지 않습니다.

## 카카오톡 설정

`.env.example`을 참고해 `.env`를 만듭니다.

```bash
DASHBOARD_URL=http://localhost:3000
KAKAO_SEND_MODE=disabled
KAKAO_ACCESS_TOKEN=
KAKAO_FRIEND_UUIDS=
```

`KAKAO_SEND_MODE`는 다음 중 하나입니다.

- `disabled`: 알림을 보내지 않고 로그만 남깁니다.
- `me`: 카카오 Developers의 나에게 보내기 API를 사용합니다.
- `friend`: 친구 메시지 API를 사용합니다. `KAKAO_FRIEND_UUIDS`가 필요합니다.

카카오 권한 심사나 친구 목록 접근이 준비되지 않았다면 `disabled` 또는 `me`로 먼저 검증하세요.

## 데이터 파일

로컬 데이터는 `data/`에 저장합니다.

- `state.json`: 최신 감시 상태
- `history.json`: 입주대기자 수 변경 이력
- `logs.json`: 실행 로그

테스트나 임시 실행에서 실제 데이터를 건드리고 싶지 않으면 `DATA_DIR=/tmp/waitlist-alert-data pnpm monitor:once`처럼 저장 경로를 바꿀 수 있습니다.

## 검증

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 카카오 테스트 메시지

`.env` 설정이 끝난 뒤 아래 명령으로 변경 감지와 무관하게 테스트 메시지를 보낼 수 있습니다.

```bash
pnpm kakao:test
```
