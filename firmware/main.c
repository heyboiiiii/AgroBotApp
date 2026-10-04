#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

#include "neo6m.h"
#include "lora.h"

#define SERIAL_PORT "/dev/ttyUSB0"//GPS

#define SERVER_IP "127.0.0.1"
#define SERVER_PORT 4001
#define SEND_INTERVAL_SECONDS 5

//GPS NEO6M variables
int gps_fd = -1; // GPS serial port file descriptor
double latitude, longitude;
double temperature;
char lat_hemisphere, lon_hemisphere;

static int connect_to_backend(void)
{
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0)
    {
        perror("socket");
        return -1;
    }

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(SERVER_PORT);

    if (inet_pton(AF_INET, SERVER_IP, &server_addr.sin_addr) != 1)
    {
        fprintf(stderr, "Invalid backend IP address: %s\n", SERVER_IP);
        close(sock);
        return -1;
    }

    if (connect(sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0)
    {
        perror("connect");
        close(sock);
        return -1;
    }

    printf("Connected to AgroBot backend at %s:%d\n", SERVER_IP, SERVER_PORT);
    return sock;
}

static int send_collar_data(int sock, const char *payload)
{
    size_t length = strlen(payload);
    size_t sent = 0;

    while (sent < length)
    {
        ssize_t result = send(sock, payload + sent, length - sent, 0);
        if (result <= 0)
        {
            perror("send");
            return -1;
        }
        sent += (size_t)result;
    }

    printf("Sent telemetry: %s", payload);
    return 0;
}

static uint8_t gps_listening(){
    if(neo6m_read_data(gps_fd, &latitude, &longitude, &lat_hemisphere, &lon_hemisphere, NULL) == 0) {
        printf("Received GPS data:\n");
        printf("Latitude: %f %c\n", latitude, lat_hemisphere);
        printf("Longitude: %f %c\n", longitude, lon_hemisphere);
        return 0;
    }
    printf("No GPS data received within the timeout period.\n");
    return 1;
}

int main(void)
{   /*
        static const char *payloads[] = {
        "{\"ID\":\"COLLAR-01\",\"FIRMWARE_VERS\":\"1.0\",\"HARDWARE_VERS\":\"1.0\",\"LAT\":-34.707652,\"LONG\":-58.242300,\"TEMP\":\"38.4\"}\n",
        "{\"ID\":\"COLLAR-02\",\"FIRMWARE_VERS\":\"1.0\",\"HARDWARE_VERS\":\"1.0\",\"LAT\":-34.708100,\"LONG\":-58.243000,\"TEMP\":\"37.9\"}\n",
        };
        
    */
    
    /*
    ******************************************************************************
                            GPS NEO6M UART interface
    ******************************************************************************
    */

    
    gps_fd = neo6m_init(SERIAL_PORT); // Initialize the UART interface for the GPS module
    if (gps_fd < 0) {
        printf("Failed to initialize GPS module\n");
        return 1;
    }


    /*

    ******************************************************************************
                            LORA XL1278 SPI interface
    ******************************************************************************
    
    */

    uint8_t packet[LORA_PACKET_SIZE];
    size_t packet_length = 0;

    if (lora_initialize() < 0) {
        close_receiver();
        return EXIT_FAILURE;
    }
    

    
    const size_t payload_count = sizeof(payloads) / sizeof(payloads[0]);
    size_t payload_index = 0;
    int sock = -1;

    for (;;)
    {   
        //Socket conn -> server
        
        if (sock < 0)
        {
            sock = connect_to_backend();
            if (sock < 0)
            {
                fprintf(stderr, "Server: Retrying in %d seconds...\n", SEND_INTERVAL_SECONDS);
                sleep(SEND_INTERVAL_SECONDS);
                continue;
            }
        }
        //GPS data <- RP

        if (gps_listening() != 0)
        {
            fprintf(stderr, "GPS: Retrying in %d seconds...\n", SEND_INTERVAL_SECONDS);
            sleep(SEND_INTERVAL_SECONDS);
            continue;
        }

        //LoRa data <- Agroneck

        if (lora_receive_packet(packet, sizeof(packet), &packet_length) < 0) {
            perror("receive LoRa packet");
            close_receiver();
            return EXIT_FAILURE;
        }


        // Prepare the payload with the latest GPS data
        char payload[192];
        snprintf(payload, sizeof(payload),
                 "{\"ID\":\"COLLAR-%02zu\",\"LAT\":%.6f,\"LONG\":%.6f,\"TEMP\":\"%.2f\"}\n",
                 payload_index + 1,
                 latitude,
                 longitude,
                 temperature);

        if (send_collar_data(sock, payload) < 0)
        {
            close(sock);
            sock = -1;
            continue;
        }

        payload_index = (payload_index + 1) % payload_count;
        sleep(SEND_INTERVAL_SECONDS);
    }

    close(sock);
    return EXIT_SUCCESS;
}

/*
static const char *payloads[] = {
        "{\"ID\":\"RP\",\"FIRMWARE_VERS\":\"1.0\",\"HARDWARE_VERS\":\"1.0\",\"LAT\":-34.707652,\"LONG\":-58.242300,\"TEMP\":\"38.4\"}\n",
        "{\"ID\":\"COLLAR-01\",\"FIRMWARE_VERS\":\"1.0\",\"HARDWARE_VERS\":\"1.0\",\"LAT\":-34.708100,\"LONG\":-58.243000,\"TEMP\":\"37.9\"}\n",
    };
*/
