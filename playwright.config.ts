import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
 testDir:'./tests',fullyParallel:true,timeout:30000,expect:{timeout:5000},workers:2,retries:0,
 reporter:[['list']],outputDir:'/tmp/pep-reader-test-results',
 use:{baseURL:'http://127.0.0.1:5180/pep-english-reader/',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'],channel:process.env.CI?undefined:'chrome'}},{name:'firefox',use:{...devices['Desktop Firefox']}},{name:'webkit',use:{...devices['Desktop Safari']}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',url:'http://127.0.0.1:5180/pep-english-reader/',reuseExistingServer:!process.env.CI,timeout:30000},
})
