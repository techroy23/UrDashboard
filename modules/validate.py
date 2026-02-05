from modules import user


def validate_token(token):
    return user.get_user_data(token)
