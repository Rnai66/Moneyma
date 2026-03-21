# Personal Finance Manager 💰

A modern desktop application for managing your personal finances built with Electron, React, and SQLite.

## Features ✨

- 📊 **Dashboard** - Overview of your financial summary
- 💰 **Transaction Management** - Add, edit, delete income and expenses
- 🔍 **Search & Filter** - Find transactions easily
- 📈 **Statistics** - View spending by category
- 📤 **Export** - Export data to Excel/PDF
- 💾 **Backup** - Automatic database backup
- 🎨 **Modern UI** - Beautiful and intuitive interface

## Prerequisites

Before you begin, ensure you have installed:
- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)
- **Visual Studio Code** (optional) - [Download](https://code.visualstudio.com/)

## Installation

1. **Clone or navigate to the project directory:**
```bash
cd finance-manager
```

2. **Install dependencies:**
```bash
npm install
```

This will install:
- `electron` - Framework for desktop apps
- `react` - UI library
- `better-sqlite3` - Database
- `chart.js` - Charts for statistics
- And other required packages

## Running the Application

### Development Mode

Run both React and Electron in development mode:

```bash
npm run dev
```

This will:
- Start React dev server on http://localhost:3000
- Launch Electron app
- Enable hot reload for development

### Production Build

To build the application for macOS:

```bash
npm run build-mac
```

This creates a `.dmg` installer file in the `dist/` folder.

## Project Structure

```
finance-manager/
├── public/
│   ├── index.html          # HTML template
│   ├── electron.js         # Electron main process
│   └── preload.js          # Electron security layer
├── src/
│   ├── components/         # Reusable components
│   ├── pages/
│   │   ├── Dashboard.js    # Dashboard page
│   │   ├── Transactions.js # Transactions page
│   │   ├── Statistics.js   # Statistics page
│   │   └── Settings.js     # Settings page
│   ├── database/
│   │   └── DatabaseService.js  # SQLite database manager
│   ├── services/           # API services
│   ├── styles/
│   │   ├── App.css         # Main styles
│   │   └── index.css       # Global styles
│   ├── App.js              # Main React component
│   └── index.js            # React entry point
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## Database

The app uses **SQLite3** for data storage:
- Database file: `~/Library/Application Support/Personal Finance Manager/finance.db` (macOS)
- Automatically created on first run
- Stores transactions and categories

## Troubleshooting

### Issue: `npm install` fails
**Solution:** Clear npm cache and try again:
```bash
npm cache clean --force
npm install
```

### Issue: Electron won't start
**Solution:** Make sure port 3000 is not in use:
```bash
lsof -i :3000  # Check what's using port 3000
```

### Issue: Database not found
**Solution:** The database is created automatically on first run. Check application logs for errors.

## Next Steps

### Phase 2: Enhancements
- [ ] Add chart visualizations
- [ ] Implement recurring transactions
- [ ] Add budget limits
- [ ] Multi-currency support
- [ ] Cloud sync
- [ ] Mobile app integration

### Phase 3: Advanced Features
- [ ] Machine learning for categorization
- [ ] Receipt OCR
- [ ] Bank integration
- [ ] Investment tracking
- [ ] Tax report generation

## Development Tips

1. **Hot Reload**: Changes to React components reload automatically
2. **DevTools**: Press `Cmd+Option+I` to open Chrome DevTools
3. **Database**: Use SQLite Browser to inspect database:
   - Download [DB Browser for SQLite](https://sqlitebrowser.org/)
   - Open `~/Library/Application Support/Personal Finance Manager/finance.db`

## Building for Other Platforms

### Windows Build
```bash
npm run build && electron-builder --win
```

### Linux Build
```bash
npm run build && electron-builder --linux
```

## Performance Tips

- The app uses SQLite with WAL (Write-Ahead Logging) for better concurrency
- Index on frequently queried columns (date, type, category)
- Paginate large result sets in future versions

## Security

- ✅ Context isolation enabled (main and renderer process separate)
- ✅ No Node.js in renderer process
- ✅ IPC preload for secure communication
- ⚠️ Data stored locally - never sent to servers

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Create an issue on the project repository

## GitHub Pages

This project includes a GitHub Pages deployment workflow for publishing the static `build/` output.

Deployment guide:

- [GitHub Pages Deploy Guide](/Users/rnaibro/PFM/docs/github-pages-deploy.md)

---

**Happy budgeting! 💸**
