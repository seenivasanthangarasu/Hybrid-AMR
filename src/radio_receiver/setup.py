import os
from glob import glob
from setuptools import find_packages, setup

package_name = 'radio_receiver'

setup(
    name=package_name,
    version='1.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ubuntu',
    maintainer_email='ubuntu@todo.todo',
    description='ROS 2 Jazzy hardware node for HOT RC DS-600 FA-06 radio receiver',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'radio_receiver_node = radio_receiver.radio_receiver_node:main',
        ],
    },
)
