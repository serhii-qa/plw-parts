const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const chalk = require('chalk');

const baseUrls = {
    home: '',         // env
    login: ''   // env
};
const auth = {
    email: '',           // env
    password:''                    // env
}

const browserOpt = {
    headless: true,
    slowMo: 0,
};

const goodsCollection = [];
const menuArr = [];

const productCollector = async (categoryName, productList) => {
    for (let i = 0; i < productList.length; i++) {
        const productTitle = await productList[i].$eval('div[class="name"]', el => el.innerText );
        const productUPC  = await productList[i].$eval('div[class="extra"]', el => el.innerText );
        const productURL = await productList[i].$eval('div[class="name"]>a', el => el.getAttribute('href'));
        let productPrice
        try {
            productPrice = await productList[i].$eval('div[class="price"]>span[class="price-new"]', el => el.innerText);
        } catch (err) {
            productPrice = await productList[i].$eval('div[class="price"]', el => el.innerText);
        }

        let productStatus;
        if ( await productList[i].$eval('div[class="cart"]', el => el.innerText ) === 'Купить') {
            productStatus = 'В наличии';
        } else {
            productStatus = 'Нет в наличии';
        }
        goodsCollection.push({
            categoryName: categoryName,
            productTitle: productTitle,
            productUPC: productUPC.replace(/[^0-9]/g, ''),
            productURL: productURL,
            productPrice: productPrice.replace(/[^0-9]/g, ''),
            productStatus: productStatus,
        });
    }
}

(async () => {
    console.time('run')
    const browser = await chromium.launch(browserOpt);
    const context = await browser.newContext();
    const page = await context.newPage();

    // requests-decrease
    await page.route('**/*', route => {
        return route.request().resourceType() !== 'document' ? route.abort() : route.continue();
    });

    // Auth
    await page.goto(baseUrls.login);
    await page.fill('input[name="email"]', auth.email);
    await page.fill('input[name="password"]', auth.password);
    await page.check('label[for="input-remember"]');
    await page.click('input[type="submit"]');

    await page.goto(baseUrls.home, {waitUntil: "domcontentloaded"});

    // Creating main menu
    const menuSrc = await page.$$('.box-category>li>a');
    for (let i = 0; i < menuSrc.length; i++) {              // menuSrc.length
        menuArr[i] = {
            categoryName: await menuSrc[i].innerText(),
            categoryLink: `${await menuSrc[i].getAttribute('href')}?limit=100`   // products per page
        };
    }
    console.log( `Total main menu items: ${menuArr.length}` );

    let productListSrc;
    let currentCategoryName;

    // Main flow
    for (let iter = 1; iter < 2; iter++) {              // menuArr.length
        await page.goto( menuArr[iter].categoryLink, {waitUntil: "domcontentloaded"} );
        currentCategoryName = menuArr[iter].categoryName;
        productListSrc = await page.$$('div[class="product-list"]>div');
        console.log( chalk.blue(`\n${menuArr[iter].categoryName} : ${await (await page.$('.pagination .results')).innerText()}`) );

        if (currentCategoryName === 'Для навигаторов') {
            continue;
        } else {
            await productCollector(currentCategoryName, productListSrc);
            console.log( chalk.yellow(`Page [1] Stored products: + ${productListSrc.length}`) );
        }

        let paginationPages = 1;
        try {
            await page.waitForSelector('a:has-text(">|")', {timeout: 2000});
            await page.click('a:has-text(">|")');
            await page.waitForLoadState('domcontentloaded');

            paginationPages = +(await page.$eval('div[class="pagination"]>div[class="links"] :last-child', el =>el.innerText));
            console.log( chalk.green(`Total pages: ${paginationPages}`) );
            await page.goBack({waitUntil: "domcontentloaded"});
        } catch (err) {
            console.log( chalk.red(`Total page: ${paginationPages}`) );
        }

        try {
            for (let j = 1; j < paginationPages; j++) {
                await page.click('a:has-text(">")');
                await page.waitForLoadState('domcontentloaded');
                productListSrc = await page.$$('div[class="product-list"]>div');
                await productCollector(currentCategoryName, productListSrc);
                console.log( chalk.gray(`Page [${j+1}] Stored products: + ${productListSrc.length}`) );
            }
        } catch (err) {
            console.log(`[ Pagination navigation error ]`);
        }
    }

    await page.close();
    await context.close();
    await browser.close();

    console.log(`\nTotal gods:`, goodsCollection.length);

    // Checking for doubles in goods
    const goodsResultDataArr = [];
    for (let i = 0; i < goodsCollection.length; i++ ) {
      goodsResultDataArr.push(goodsCollection[i].productTitle);
    }
    const goodsResultDataSet = new Set(goodsResultDataArr);
    console.log(`Total unique positions Set size: ${goodsResultDataSet.size}`);
    console.log('Total unique positions JSON keys: ', Object.keys(goodsCollection).length);
    console.log(`Well done? ${goodsResultDataSet.size === Object.keys(goodsCollection).length}`);

    const date = new Date();
    const fileName = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}_${date.getDate()}.${(date.getMonth())+1}.${date.getFullYear()}`;

    console.time('Saving to **.csv');

    // writing down **.csv file
    const csvWriter = createCsvWriter({
        path: `./storedData/${fileName}.csv`,
        header: [
            {id: 'categoryName', title: 'Category'},
            {id: 'productTitle', title: 'Product Name'},
            {id: 'productUPC', title: 'Vendor Code'},
            {id: 'productURL', title: 'Product URL'},
            {id: 'productPrice', title: 'Price'},
            {id: 'productStatus', title: 'In Stock'},
        ]
    });

    csvWriter.writeRecords(goodsCollection)       // returns a promise
        .then(() => {
            console.log( chalk.bold.magenta(`Result saved to: ${fileName}.csv`) );
        });
    console.timeEnd('Saving to **.csv');

    console.timeEnd('run');
})();
