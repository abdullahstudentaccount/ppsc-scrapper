const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;


app.use(express.static('public'));
app.use(express.json());

app.post('/api/search', async (req, res) => {
    const { keywords } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'Keywords are required' });
    }

    console.log(`Searching for keywords: ${keywords.join(', ')}`);

    let browser = null;
    try {
        // browser = await chromium.launch({ headless: true });
        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            timeout: 0
          });
          
        const page = await browser.newPage();

        // Navigate to PPSC Planner
        console.log('Navigating to PPSC Planner...');
        await page.goto('https://ppsc.gop.pk/planner/showdata.aspx', { timeout: 0 });

        // Wait for the table to load
        // The table ID seems to be dynamic or DataTables_Table_0
        console.log('Waiting for table...');
        await page.waitForSelector('table.dataTable', { timeout: 0 });

        // Change entries to 100
        console.log('Changing entries to 100...');
        // Try to find the length select. It's usually in a div with class dataTables_length
        const selectSelector = 'select[name*="_length"]'; // Matches DataTables_Table_0_length or similar
        await page.waitForSelector(selectSelector, { timeout: 0 });
        await page.selectOption(selectSelector, '100');

        // Wait for the table to update
        await page.waitForTimeout(3000);

        // Scrape data
        console.log('Scraping data...');
        const jobs = await page.evaluate(() => {
            // Find the main table
            const table = document.querySelector('table.dataTable');
            if (!table) return [];

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 19) return null; // Skip invalid rows

                // Corrected indices based on observation:
                // 0: Sr No
                // 1: Post Name
                // 2: Department
                // 3: Case No
                // 4: Advt No
                // 7: Closing Date
                // 18: Status
                return {
                    srNo: cells[0]?.innerText?.trim(),
                    postName: cells[1]?.innerText?.trim(),
                    department: cells[2]?.innerText?.trim(),
                    caseNo: cells[3]?.innerText?.trim(),
                    advtNo: cells[4]?.innerText?.trim(),
                    closingDate: cells[7]?.innerText?.trim(),
                    status: cells[18]?.innerText?.trim(),
                    link: row.querySelector('a')?.href || ''
                };
            }).filter(job => job !== null);
        });

        console.log(`Found ${jobs.length} jobs. Filtering...`);
        if (jobs.length > 0) {
            console.log('First job sample:', JSON.stringify(jobs[0], null, 2));
        }

        // Filter by keywords
        const filteredJobs = jobs.filter(job => {
            const text = `${job.postName} ${job.department}`.toLowerCase();
            const matchesKeyword = keywords.some(keyword => text.includes(keyword.toLowerCase()));

            if (!matchesKeyword) return false;

            // Date Filtering
            if (job.closingDate) {
                const parts = job.closingDate.split('-');
                if (parts.length === 3) {
                    // DD-MM-YYYY to YYYY-MM-DD
                    const dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Compare dates only
                    if (dateObj < today) {
                        return false; // Expired
                    }
                }
            }
            return true;
        });

        console.log(`Found ${filteredJobs.length} matches (after date filter).`);

        // Pagination
        const pageNum = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const startIndex = (pageNum - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = filteredJobs.slice(startIndex, endIndex);

        res.json({
            success: true,
            count: filteredJobs.length,
            page: pageNum,
            totalPages: Math.ceil(filteredJobs.length / limit),
            data: paginatedResults
        });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape data', details: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// Scheduler & WhatsApp Logic
let activeInterval = null;

function parseInterval(intervalStr) {
    const num = parseInt(intervalStr);
    if (isNaN(num)) return null;

    if (intervalStr.includes('min')) return num * 60 * 1000;
    if (intervalStr.includes('hour')) return num * 60 * 60 * 1000;
    if (intervalStr.includes('day')) return num * 24 * 60 * 60 * 1000;
    if (intervalStr.includes('week')) return num * 7 * 24 * 60 * 60 * 1000;

    return null;
}

function sendWhatsapp(phone, jobs) {
    console.log(`\n[WHATSAPP SIMULATION] Sending message to ${phone}:`);
    console.log('--------------------------------------------------');
    console.log(`Found ${jobs.length} new jobs matching your criteria:\n`);
    jobs.forEach((job, i) => {
        console.log(`${i + 1}. ${job.postName} (${job.department}) - Closing: ${job.closingDate}`);
        console.log(`   Link: ${job.link}`);
    });
    console.log('--------------------------------------------------\n');
}

async function runScraperTask(keywords, phoneNo) {
    console.log(`[Scheduler] Running task for keywords: ${keywords.join(', ')}`);
    // Re-use the scraping logic (refactoring would be better, but for now we duplicate or call internal function)
    // To avoid duplication, let's extract the core scraping logic if possible, or just spawn a new browser instance here.
    // For simplicity in this task, I'll copy the core logic or make a helper. 
    // Actually, let's make a helper function `scrapeJobs(keywords)`

    let browser = null;
    try {
        // browser = await chromium.launch({ headless: true });
        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            timeout: 0
          });
          
        const page = await browser.newPage();
        await page.goto('https://ppsc.gop.pk/planner/showdata.aspx', { timeout: 0 });
        await page.waitForSelector('table.dataTable', { timeout: 0 });

        // Change entries to 100
        const selectSelector = 'select[name*="_length"]';
        if (await page.$(selectSelector)) {
            await page.selectOption(selectSelector, '100');
            await page.waitForTimeout(0);
        }

        const jobs = await page.evaluate(() => {
            const table = document.querySelector('table.dataTable');
            if (!table) return [];
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 19) return null;
                return {
                    postName: cells[1]?.innerText?.trim(),
                    department: cells[2]?.innerText?.trim(),
                    closingDate: cells[7]?.innerText?.trim(),
                    link: row.querySelector('a')?.href || ''
                };
            }).filter(job => job !== null);
        });

        const filteredJobs = jobs.filter(job => {
            const text = `${job.postName} ${job.department}`.toLowerCase();
            const matchesKeyword = keywords.some(keyword => text.includes(keyword.toLowerCase()));
            if (!matchesKeyword) return false;
            if (job.closingDate) {
                const parts = job.closingDate.split('-');
                if (parts.length === 3) {
                    const dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (dateObj < today) return false;
                }
            }
            return true;
        });

        if (filteredJobs.length > 0) {
            sendWhatsapp(phoneNo, filteredJobs);
        } else {
            console.log('[Scheduler] No matching jobs found.');
        }

    } catch (error) {
        console.error('[Scheduler] Error:', error);
    } finally {
        if (browser) await browser.close();
    }
}

app.post('/api/start-job', (req, res) => {
    const { keywords, interval, phoneNo } = req.body;

    if (!keywords || !interval || !phoneNo) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const intervalMs = parseInterval(interval);
    if (!intervalMs) {
        return res.status(400).json({ error: 'Invalid interval format' });
    }

    if (activeInterval) clearInterval(activeInterval);

    console.log(`[Scheduler] Started. Interval: ${interval} (${intervalMs}ms). Phone: ${phoneNo}`);

    // Run immediately
    runScraperTask(keywords, phoneNo);

    // Schedule
    activeInterval = setInterval(() => {
        runScraperTask(keywords, phoneNo);
    }, intervalMs);

    res.json({ success: true, message: 'Scheduler started' });
});

app.post('/api/stop-job', (req, res) => {
    if (activeInterval) {
        clearInterval(activeInterval);
        activeInterval = null;
        console.log('[Scheduler] Stopped.');
        res.json({ success: true, message: 'Scheduler stopped' });
    } else {
        res.json({ success: false, message: 'No active scheduler' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
