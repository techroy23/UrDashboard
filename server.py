import os
import time
import asyncio

from sanic import Sanic, response
from sanic.exceptions import NotFound
from jinja2 import Environment, FileSystemLoader

from modules import quotes
from modules import errorManager
from modules import user as user_module
from modules import stats as stats_module
from modules import login as login_module
from modules import health as health_module
from modules import ranking as ranking_module
from modules import validate as validate_module
from modules import location as location_module
from modules import leaderboard as leaderboard_module
from modules import reliability as reliability_module


# ==========================================
# 2. Configuration
# ==========================================
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
STATIC_ROOT = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

if not os.path.exists(TEMPLATES_DIR):
    os.makedirs(TEMPLATES_DIR)


# ==========================================
# 3. Application Factory
# ==========================================
app = Sanic("UrDashboard")


@app.before_server_start
async def start_scheduler(app):
    """Starts background tasks for health and location modules."""
    # Start tasks without awaiting them to prevent blocking server startup
    app.ctx.health_task = asyncio.create_task(health_module.run_scheduler())
    app.ctx.location_task = asyncio.create_task(location_module.start_background_task())


# ==========================================
# 4. Template Engine
# ==========================================
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)


def render_template(template_name, request=None, **context):
    """
    Renders a Jinja2 template and adds security headers.

    Args:
        template_name (str): Name of the template file.
        request (Request): The Sanic request object.
        **context: Context variables to pass to the template.
    """
    try:
        template = jinja_env.get_template(template_name)
        # Add unix_epoch for cache busting in templates
        context["unix_epoch"] = int(time.time())
        html_content = template.render(**context)
        res = response.html(html_content)

        res.headers["X-XSS-Protection"] = "1; mode=block"
        res.headers["X-Content-Type-Options"] = "nosniff"
        return res
    except Exception as e:
        if request:
            return errorManager.handle_error(
                request, f"Template Error: {str(e)}", status_code=500
            )
        return response.text(f"Template Error: {str(e)}", status=500)


# ==========================================
# 5. Middleware & Security
# ==========================================
@app.middleware("request")
async def block_directory_access(request):
    """Block directory listing attempts on static paths."""
    if request.path.startswith("/static") and request.path.endswith("/"):
        raise NotFound("Directory access not allowed")


# Serve static files
app.static("/static", STATIC_ROOT)


@app.middleware("response")
async def add_cache_headers(request, res):
    """Adds cache control headers to static resources."""
    if request.path.startswith("/static/"):
        if request.path.endswith(".css"):
            res.headers["Cache-Control"] = "public, max-age=604800, immutable"

        elif request.path.endswith(".js") and "master.js" not in request.path:
            res.headers["Cache-Control"] = "public, max-age=604800, immutable"

        elif any(
            request.path.endswith(ext)
            for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2"]
        ):
            res.headers["Cache-Control"] = "public, max-age=604800"


@app.on_response
async def add_security_headers(request, res):
    """Adds global security headers to all responses."""
    res.headers["X-XSS-Protection"] = "1; mode=block"
    res.headers["X-Content-Type-Options"] = "nosniff"


# ==========================================
# 6. Exception Handlers
# ==========================================
@app.exception(NotFound)
async def handle_404(request, exception):
    """Renders the 404 error page."""
    return render_template("404.html", request=request)


@app.exception(IsADirectoryError)
async def handle_directory_error(request, exception):
    """Convert directory listing errors to 404 page."""
    return render_template("404.html", request=request)


# ==========================================
# 7. WebHandlers
# ==========================================
class WebHandlers:
    """Handlers for serving HTML pages."""

    @staticmethod
    async def index(request):
        """Renders the home page."""
        return render_template("index.html", request=request)

    @staticmethod
    async def statistics(request):
        """Renders the statistics page."""
        return render_template("statistics.html", request=request)

    @staticmethod
    async def reliability(request):
        """Renders the reliability page."""
        return render_template("reliability.html", request=request)

    @staticmethod
    async def locations(request):
        """Renders the locations page."""
        return render_template("locations.html", request=request)

    @staticmethod
    async def leaderboard(request):
        """Renders the leaderboard page."""
        return render_template("leaderboard.html", request=request)

    @staticmethod
    async def health(request):
        """Renders the system health page."""
        return render_template("health.html", request=request)

    @staticmethod
    async def login(request):
        """Handles login page rendering and authentication form submission."""
        if request.method == "POST":
            login_mode = request.form.get("login_mode")
            username = request.form.get("username", "")
            password = request.form.get("password", "")
            auth_code = request.form.get("auth_code", "")

            if login_mode == "auth_code":
                api_response = login_module.login_with_code(auth_code)
            else:
                api_response = login_module.login_with_password(username, password)

            if "error" in api_response and api_response.get("error"):
                error_data = api_response["error"]
                error_msg = (
                    error_data.get("message", "Unknown error")
                    if isinstance(error_data, dict)
                    else str(error_data)
                )
                return render_template("login.html", request=request, error=error_msg)

            network_data = api_response.get("network", {})
            by_jwt = network_data.get("by_jwt")

            if by_jwt:
                return render_template(
                    "auth_success.html", request=request, by_jwt=by_jwt
                )

            elif "by_jwt" in api_response:
                return render_template(
                    "auth_success.html", request=request, by_jwt=api_response["by_jwt"]
                )
            else:
                return render_template(
                    "login.html",
                    request=request,
                    error="Login failed: No JWT token received.",
                )

        return render_template("login.html", request=request)

    @staticmethod
    async def well_known(request, path=None):
        """Serves .well-known files (placeholder)."""
        return response.empty()

    @staticmethod
    async def sitemap(request):
        """Serve sitemap.xml for web crawlers."""
        sitemap_path = os.path.join(STATIC_ROOT, "sitemap.xml")
        if os.path.exists(sitemap_path):
            return await response.file(sitemap_path)
        return response.text("Sitemap not found", status=404)

    @staticmethod
    async def robots(request):
        """Serve robots.txt for web crawlers."""
        robots_path = os.path.join(STATIC_ROOT, "robots.txt")
        if os.path.exists(robots_path):
            return await response.file(robots_path)
        return response.text("User-agent: *\nDisallow: /", content_type="text/plain")


# ==========================================
# 8. ApiHandlers
# ==========================================
class ApiHandlers:
    """Handlers for API endpoints."""

    @staticmethod
    async def login(request):
        """API endpoint for user login."""
        data = request.json
        login_mode = data.get("login_mode")
        username = data.get("username", "")
        auth_code = data.get("auth_code", "")
        password = data.get("password", "")

        if login_mode == "auth_code":
            api_response = login_module.login_with_code(auth_code)
        else:
            api_response = login_module.login_with_password(username, password)
        return response.json(api_response)

    @staticmethod
    async def reliability(request):
        """API endpoint for reliability data."""
        token = request.json.get("token")
        if not token:
            return errorManager.handle_error(
                request, "No token provided", status_code=400
            )
        result = reliability_module.get_reliability_data(token)
        if not result.get("valid") and result.get("reason"):
            return errorManager.handle_error(
                request, result.get("reason"), status_code=400
            )
        return response.json(result)

    @staticmethod
    async def stats(request):
        """API endpoint for transfer statistics."""
        token = request.json.get("token")
        if not token:
            return errorManager.handle_error(
                request, "No token provided", status_code=400
            )
        result = stats_module.get_transfer_stats(token)
        if not result.get("valid") and result.get("reason"):
            return errorManager.handle_error(
                request, result.get("reason"), status_code=400
            )
        return response.json(result)

    @staticmethod
    async def user(request):
        """API endpoint for user data."""
        token = request.json.get("token")
        if not token:
            return errorManager.handle_error(
                request, "No token provided", status_code=400
            )
        result = user_module.get_user_data(token)
        if not result.get("valid") and result.get("reason"):
            return errorManager.handle_error(
                request, result.get("reason"), status_code=400
            )
        return response.json(result)

    @staticmethod
    async def validate_token(request):
        """API endpoint to validate a token."""
        token = request.json.get("token")
        if not token:
            return errorManager.handle_error(
                request, "No token provided", status_code=400
            )

        # Run blocking validation in executor to prevent server freeze
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, validate_module.validate_token, token)

        # Pass network errors to frontend for optimistic handling
        if result.get("network_error"):
            return response.json(result, status=503)

        if not result.get("valid") and result.get("reason"):
            return errorManager.handle_error(
                request, result.get("reason"), status_code=401
            )
        return response.json(result)

    @staticmethod
    async def quote(request):
        """API endpoint to get quotes."""
        result = quotes.get_all_quotes()
        return response.json(result)

    @staticmethod
    async def locations(request):
        """API endpoint for provider locations."""
        result = location_module.get_provider_locations()
        return response.json(result)

    @staticmethod
    async def location_history(request):
        """API endpoint for location history."""
        result = location_module.get_location_history()
        return response.json(result)

    @staticmethod
    async def leaderboard(request):
        """API endpoint for leaderboard data."""
        token = request.json.get("token")
        if not token:
            return errorManager.handle_error(
                request, "No token provided", status_code=400
            )

        leaderboard_res = leaderboard_module.get_leaderboard_data(token)
        ranking_res = ranking_module.get_ranking_data(token)
        user_res = user_module.get_user_data(token)

        if not leaderboard_res.get("valid") or not ranking_res.get("valid"):
            reason = leaderboard_res.get("reason") or ranking_res.get("reason")
            return errorManager.handle_error(request, reason, status_code=400)

        ranking_data = ranking_res.get("ranking", {})
        if user_res.get("valid"):
            ranking_data["network_name"] = user_res.get("network_name")

        return response.json(
            {
                "valid": True,
                "leaderboard": leaderboard_res.get("earners", []),
                "ranking": ranking_data,
            }
        )

    @staticmethod
    async def health(request):
        """API endpoint for system health checks."""
        cutoff = int((time.time() - (14 * 24 * 60 * 60)) * 1000)
        data = health_module.get_checks(since=cutoff)
        return response.json(data)


# ==========================================
# 9. Route Mapping
# ==========================================

# --- Web Routes ---
app.add_route(WebHandlers.index, "/", name="web_index")
app.add_route(WebHandlers.statistics, "/statistics", name="web_statistics")
app.add_route(WebHandlers.reliability, "/reliability", name="web_reliability")
app.add_route(WebHandlers.locations, "/locations", name="web_locations")
app.add_route(WebHandlers.leaderboard, "/leaderboard", name="web_leaderboard")
app.add_route(WebHandlers.health, "/health", name="web_health")
app.add_route(WebHandlers.login, "/login", methods=["GET", "POST"], name="web_login")
app.add_route(WebHandlers.well_known, "/.well-known/<path:path>", name="web_well_known")
app.add_route(WebHandlers.sitemap, "/sitemap.xml", name="web_sitemap")
app.add_route(WebHandlers.robots, "/robots.txt", name="web_robots")

# --- API Routes ---
app.add_route(ApiHandlers.login, "/api/login", methods=["POST"], name="api_login")
app.add_route(
    ApiHandlers.reliability,
    "/api/reliability",
    methods=["POST"],
    name="api_reliability",
)
app.add_route(ApiHandlers.stats, "/api/stats", methods=["POST"], name="api_stats")
app.add_route(ApiHandlers.user, "/api/user", methods=["POST"], name="api_user")
app.add_route(
    ApiHandlers.validate_token,
    "/api/validate_token",
    methods=["POST"],
    name="api_validate_token",
)
app.add_route(ApiHandlers.quote, "/api/quote", methods=["GET"], name="api_quote")
app.add_route(
    ApiHandlers.locations, "/api/locations", methods=["GET"], name="api_locations"
)
app.add_route(
    ApiHandlers.location_history,
    "/api/location-history",
    methods=["GET"],
    name="api_location_history",
)
app.add_route(
    ApiHandlers.leaderboard,
    "/api/leaderboard",
    methods=["POST"],
    name="api_leaderboard",
)
app.add_route(ApiHandlers.health, "/api/health", methods=["GET"], name="api_health")


# ==========================================
# 10. Entry Point
# ==========================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, single_process=True, access_log=True, motd=True)
