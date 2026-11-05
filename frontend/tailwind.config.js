/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/aid/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: [
  				'var(--font-ui)',
  				'system-ui',
  				'sans-serif'
  			]
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				// Aid: текст и иконки акцента (в тёмной теме светлее заливки ради контраста AA)
  				ink: 'hsl(var(--primary-ink, var(--primary)))'
  			},
  			// Aid: роли цвета (globals.css). Заливки: bg-risd, bg-mikado, bg-indigo, bg-giants;
  			// текст и иконки роли на нейтральной плитке: text-*-ink; текст на заливке: text-on-role
  			risd: 'hsl(var(--risd, var(--primary)))',
  			mikado: {
  				DEFAULT: 'hsl(var(--mikado, 43 91% 63%))',
  				ink: 'hsl(var(--mikado-ink, 42 100% 27%))'
  			},
  			indigo: {
  				DEFAULT: 'hsl(var(--indigo, 255 89% 79%))',
  				ink: 'hsl(var(--indigo-ink, 254 64% 57%))'
  			},
  			giants: {
  				DEFAULT: 'hsl(var(--giants, 18 81% 57%))',
  				ink: 'hsl(var(--giants-ink, 18 76% 37%))'
  			},
  			'on-role': 'hsl(var(--on-role, 0 0% 7%))',
  			record: 'hsl(var(--record, 4 74% 49%))',
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			tertiary: '#64748b',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			// Aid: концентричные радиусы (globals.css): окно → плитка → вложенный элемент
  			window: 'var(--window-radius, 17px)',
  			tile: 'var(--tile-radius, 24px)',
  			nested: 'var(--nested-radius, 16px)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
}