/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 游戏主题色
        'snow-dark': '#1a1a2e',
        'snow-blue': '#16213e',
        'snow-ice': '#87CEEB',
        'snow-fruit': '#FF69B4',
        'snow-gold': '#D4AF37',
        // 特殊牌颜色
        'card-healer': '#228B22',
        'card-watcher': '#8B008B',
        'card-blizzard': '#4682B4',
        // 角色牌颜色
        'card-character': '#2d1b4e',
      },
      fontFamily: {
        'game': ['Cinzel', 'serif'],
        'body': ['Marcellus', 'serif'],
      },
    },
  },
  plugins: [],
}
