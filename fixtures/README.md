# Fixtures

회귀 테스트용 anchor fixture + 합성 reject fixture.

## 구조

```
fixtures/
├── grind-anchor-{NNN}.jpg    # D0 산출물 — sieve 분급 anchor (NNN = mesh midpoint)
├── manifest.json              # 메타데이터 (ground truth + 촬영 정보)
└── synthetic/                 # F04 가 anchor 로부터 자동 생성
    ├── no-coin.synth.jpg
    ├── two-coins.synth.jpg
    ├── partial-coin.synth.jpg
    └── cup-edge.synth.jpg
```

## D0 작업 — anchor 준비

1. 보유 체 mesh 페어 확인 (예: 600/850, 500/710)
2. anchor μm 값 = 페어 midpoint (예: 600/850 → 725, 500/710 → 605)
3. 분쇄물을 mesh 페어로 분급 → fraction 회수 (~10g)
4. 흰 A4 또는 흰 접시 위에 평평하게 깔고 500원 동전과 함께 촬영
5. `fixtures/grind-anchor-{NNN}.jpg` 저장
6. `manifest.json` 에 entry 추가:

```json
{
  "version": 1,
  "fixtures": [
    {
      "file": "grind-anchor-725.jpg",
      "kind": "anchor",
      "ground_truth_d50_um": 725,
      "tolerance_um": 50,
      "source": "sieve fraction 600-850μm (midpoint 725μm)",
      "shooting": {
        "device": "iPhone 15 Pro main lens",
        "lighting": "indoor warm lamp",
        "background": "white A4",
        "coin": "500won",
        "captured_at": "2026-05-XX"
      }
    }
  ]
}
```

## 디자인 spec

전체 fixture 전략: `../../Tosss-in-app/docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md`
