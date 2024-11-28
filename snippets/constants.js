'use strict';
/**A set timout for HTTP/S calls of 60 secs.*/
const timeOut = 60000;

/**Temporary Directory. ${current_dir_location}/temp/*/
const temp_dir = "temp/";

/**Temporary csv file name with location.*/
const temp_csv_file = temp_dir + "temp.csv";

/**Temporary txt file name with location.*/
const temp_txt_file = temp_dir + "temp.txt";

/**SOCKS5 propertire */
const socks5Properties = {
    SOCKS5_AUTHENTICATION_SUCCESS_BYTE: 0x00,
    SOCKS5_CUSTOM_RESP_SIZE: 2,
    SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION: 0x01,
}


module.exports = { timeOut, temp_dir, temp_csv_file, temp_txt_file, socks5Properties };