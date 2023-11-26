import os, requests
from utils import access_file_utils


def get_hms_data(lang: str = "en"):
    url = f"https://e.bambulab.com/query.php?lang={lang}"
    data = requests.get(url)
    if data.status_code == 200:
        return data
    return None

def get_http_print(serialnumber: str, remote_url: str, output_path: str):
    if output_path is None or output_path == "":
        pass  ################################################################
    serialnumber = serialnumber.upper()
    printer_access = access_file_utils.get_printer_access(serialnumber)
    if printer_access is not None and printer_access["ip"] is not None:
        if not os.path.exists(output_path):
            os.makedirs(output_path)
        data = requests.get(remote_url, allow_redirects=True)
        local_file = output_path + "/print.3mf"
        if data.status_code == 200:
            with open(local_file, 'wb') as f:
                f.write(data.content)
                return local_file
    return None