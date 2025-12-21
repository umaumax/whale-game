// --- 3. 進化テーブル（魚の階層） ---
export const FISH_TYPES = [
    { level: 1, name: "シラス", radius: 15, color: "#F5F5F5", score: 1, image: "assets/fish_01.png" },
    { level: 2, name: "アジ", radius: 25, color: "#87CEEB", score: 3, image: "assets/fish_02.png" },
    { level: 3, name: "ワカシ", radius: 35, color: "#98FB98", score: 6, image: "assets/fish_03.png" },
    { level: 4, name: "イナダ", radius: 45, color: "#FFD700", score: 10, image: "assets/fish_04.png" },
    { level: 5, name: "ワラサ", radius: 60, color: "#FFA500", score: 15, image: "assets/fish_05.png" },
    { level: 6, name: "ブリ", radius: 75, color: "#FF4500", score: 21, image: "assets/fish_06.png" },
    { level: 7, name: "タイ", radius: 90, color: "#FF69B4", score: 28, image: "assets/fish_07.png" },
    { level: 8, name: "カツオ", radius: 105, color: "#9370DB", score: 36, image: "assets/fish_08.png" },
    { level: 9, name: "マグロ", radius: 120, color: "#00008B", score: 45, image: "assets/fish_09.png" },
    { level: 10, name: "サメ", radius: 140, color: "#708090", score: 55, image: "assets/fish_10.png" },
    { level: 11, name: "クジラ", radius: 160, color: "#FFFFFF", score: 66, image: "assets/fish_11.png" }
];

// ドロップ可能な最大レベル (01:シラス ～ 05:ワラサ)
export const MAX_DROP_LEVEL = 5;

export const WALL_THICKNESS = 50;
export const GAME_WIDTH = Math.min(window.innerWidth, 500); // 画面幅に合わせて最大500px
export const GAME_HEIGHT = Math.min(window.innerHeight - 160, 700); // ヘッダー分(100px) + 下部余白(60px)を確保
export const DEADLINE_Y = 100; // 上部のデッドライン
