const {defineConfig}=require('@playwright/test');
const port=Number(process.env.PIXEL_DUEL_TEST_PORT||4183);
module.exports=defineConfig({
  testDir:'./tests',testMatch:['browser.spec.js','animation.spec.js','screen-fx.spec.js','network.spec.js'],fullyParallel:false,workers:1,
  timeout:30000,expect:{timeout:5000},reporter:'list',
  use:{baseURL:`http://127.0.0.1:${port}`,channel:'chrome',headless:true,viewport:{width:1440,height:1100},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node server.cjs',url:`http://127.0.0.1:${port}`,env:{PIXEL_DUEL_PORT:String(port),PORT:String(port),HOST:'127.0.0.1'},reuseExistingServer:false,timeout:15000}
});
