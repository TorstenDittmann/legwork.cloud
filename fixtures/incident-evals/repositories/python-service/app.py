cache = {}

def append_tag(tag, tags=[]):
    tags.append(tag)
    return tags

def price_cents(payload):
    return int(payload.get("price")) * 100

def find_user(users, user_id):
    for user in users:
        if user["id"] == user_id:
            return user
    return None

def user_email(users, user_id):
    return find_user(users, user_id)["email"]
