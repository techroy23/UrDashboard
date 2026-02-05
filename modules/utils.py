def format_bytes(size):
    if size >= 1000**4:
        return f"{size / (1000**4):.2f} TB"
    elif size >= 1000**3:
        return f"{size / (1000**3):.2f} GB"
    elif size >= 1000**2:
        return f"{size / (1000**2):.2f} MB"
    elif size >= 1000:
        return f"{size / 1000:.2f} KB"
    else:
        return f"{size} Bytes"
