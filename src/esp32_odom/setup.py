import os
from glob import glob
from setuptools import find_packages, setup

package_name = 'esp32_odom'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'config'), glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ubuntu',
    maintainer_email='ubuntu@todo.todo',
    description='ESP32 Dual Quadrature Encoder Odometry & Kinematics Driver for Hybrid-AMR',
    license='MIT',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'odom_node = esp32_odom.odom_node:main',
            'arrow_teleop = esp32_odom.arrow_teleop:main',
        ],
    },
)
