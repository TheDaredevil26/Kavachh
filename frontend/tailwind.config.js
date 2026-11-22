/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        oat: '#EFE6D8', sand: '#E3D3BA', biscuit: '#D2BC9A',
        mocha: '#8A6A4F', walnut: '#5A4030',
        powder: '#D4E7F2', sky: '#A8D2EC', harbor: '#5E9FC7',
        ink: '#000000',
        sage: '#A9D3A0', honey: '#EBC15A', madder: '#E07A7F',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Noto Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', '"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Tamil"',
               '"Noto Sans Kannada"', '"Noto Sans Telugu"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sheet: '28px', hero: '24px', card: '20px', row: '16px', field: '14px' },
      boxShadow: {
        glass: '0 8px 32px rgba(90,64,48,0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
        float: '0 16px 48px rgba(90,64,48,0.18), inset 0 1px 0 rgba(255,255,255,0.8)',
        press: '0 2px 8px rgba(90,64,48,0.16)',
      },
      spacing: { 'safe-b': 'env(safe-area-inset-bottom, 0px)', 'safe-t': 'env(safe-area-inset-top, 0px)' },
      screens: { xs: '360px', sm: '480px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
      transitionTimingFunction: { spring: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
