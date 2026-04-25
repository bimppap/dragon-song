import uvicorn


def main():
    uvicorn.run("app.main:app", reload=True)
