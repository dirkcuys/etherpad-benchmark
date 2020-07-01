# Set the variable value in *.tfvars file
# or using -var="do_token=..." CLI option
variable "do_token" {}

# Configure the DigitalOcean Provider
provider "digitalocean" {
  token = var.do_token
}

output "droplet_ips" {
    value = "${digitalocean_droplet.web.*.ipv4_address}"
} 

resource "digitalocean_ssh_key" "default" {
  name       = "My SSH key"
  public_key = file("~/.ssh/id_rsa.pub")
}

# Create a new Web Droplet in the nyc2 region
resource "digitalocean_droplet" "web" {
  image  = "ubuntu-20-04-x64"
  name   = "web-${count.index}"
  region = "nyc3"
  size   = "s-1vcpu-1gb"
  ssh_keys = [digitalocean_ssh_key.default.fingerprint]
  count  = 48
  provisioner "local-exec" {
    command = "sleep 10 && ssh-keyscan -H ${self.ipv4_address} >> ~/.ssh/known_hosts"
  }
}
