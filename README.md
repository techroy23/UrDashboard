# UrDashboard

A comprehensive web dashboard for monitoring and managing your [BringYour](https://bringyour.com) network. Built with Python (Sanic) and JavaScript, UrDashboard provides real-time insights into network performance, user statistics, reliability metrics, and more.

![License](https://img.shields.io/badge/license-Unlicense-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-green.svg)
![Framework](https://img.shields.io/badge/framework-Sanic-orange.svg)

## Features

- **User Authentication**: Secure login with username/password or authentication codes
- **Network Statistics**: View detailed transfer statistics and data usage
- **Reliability Monitoring**: Track network uptime and performance metrics
- **Location Tracking**: Monitor provider locations node counts and history
- **Leaderboard**: View top providers and network rankings
- **Health Checks**: Real-time monitoring of API endpoints with historical data
- **Responsive Design**: Clean, modern UI that works on desktop and mobile

## Tech Stack

- **Backend**: Python 3.11+, Sanic (async web framework)
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **Templating**: Jinja2
- **Database**: SQLite
- **HTTP Client**: aiohttp, requests
- **Containerization**: Docker support included

## Installation

### Prerequisites

- Python 3.11 or higher
- pip (Python package manager)

### Method 1: Local Installation

1. Clone the repository:
```bash
git clone https://github.com/techroy23/UrDashboard.git
cd UrDashboard
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the server:
```bash
# On Windows
_start_server.bat

# On Linux/Mac
bash _start_server.sh

# Or directly with Python
python server.py
```

4. Open your browser and navigate to `http://localhost:8080`

### Method 2: Docker

1. Build and run with Docker:
```bash
docker build -t urdashboard .
docker run -v /etc/_urdashboard/data:/app/data -p 8080:8080 urdashboard
```

Or use the build script:
```bash
bash _build.sh
```

## Project Structure

```
UrDashboard/
├── modules/              # Python modules for API integration
│   ├── health.py        # Health monitoring system
│   ├── user.py          # User data management
│   ├── stats.py         # Transfer statistics
│   ├── reliability.py   # Reliability metrics
│   ├── location.py      # Location tracking
│   ├── leaderboard.py   # Leaderboard data
│   ├── login.py         # Authentication logic
│   ├── quotes.py        # Quote management
│   ├── ranking.py       # User rankings
│   ├── validate.py      # Token validation
│   └── errorManager.py  # Error handling
├── static/              # Static assets (CSS, JS, images)
├── templates/           # Jinja2 HTML templates
├── server.py           # Main application entry point
├── requirements.txt    # Python dependencies
├── Dockerfile         # Docker configuration
├── _build.sh          # Docker build script
├── _start_server.sh   # Unix start script
├── _start_server.bat  # Windows start script
└── README.md          # This file
```

## Configuration

The application uses the following default configuration:

- **Host**: `::` (all interfaces)
- **Port**: `8080`
- **Static Files**: Served from `/static`
- **Templates**: Loaded from `/templates`
- **Data Storage**: SQLite database in `data/health.db`

### Environment Variables

You can customize the behavior by setting environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server bind address | `::` |
| `PORT` | Server port | `8080` |

## API Endpoints

### Web Routes

| Route | Description |
|-------|-------------|
| `/` | Home page |
| `/statistics` | Transfer statistics page |
| `/reliability` | Reliability metrics page |
| `/locations` | Location tracking page |
| `/leaderboard` | Leaderboard page |
| `/health` | System health page |
| `/login` | Authentication page |

### API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | User authentication |
| `/api/user` | POST | Get user data |
| `/api/stats` | POST | Get transfer statistics |
| `/api/reliability` | POST | Get reliability data |
| `/api/leaderboard` | POST | Get leaderboard data |
| `/api/validate_token` | POST | Validate JWT token |
| `/api/locations` | GET | Get provider locations |
| `/api/location-history` | GET | Get location history |
| `/api/health` | GET | Get health check data |
| `/api/quote` | GET | Get random quotes |

### Health Monitoring

The dashboard includes a built-in health monitoring system that:

- Checks the Upstream API every 5 minutes
- Stores latency and status data in SQLite
- Retains 14 days of historical data
- Provides real-time status indicators

## Security Features

- XSS Protection headers (`X-XSS-Protection`)
- Content-Type sniffing prevention (`X-Content-Type-Options`)
- Secure static file serving with cache control
- No directory listing on static paths
- Token-based API authentication

## Development

### Adding New Features

1. Create a new module in `modules/`
2. Add routes in `server.py`
3. Create templates in `templates/`
4. Add static assets in `static/`

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in `server.py` or stop the conflicting service
2. **Module not found**: Ensure all dependencies are installed: `pip install -r requirements.txt`
3. **Permission denied**: Run with appropriate permissions or change the data directory

### Logs

The application logs to stdout/stderr. Check the console output for detailed error messages.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is released under the [Unlicense](LICENSE). Feel free to use it for any purpose.

---

**Note**: This is an unofficial dashboard and is not affiliated with BringYour|UrNetwork.
